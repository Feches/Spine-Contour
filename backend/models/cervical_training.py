"""Build-only definitions for the cervical DETR + HRNET pipeline.

Desktop inference imports cervical.py, which has no training dependencies.
"""
from pathlib import Path

import timm
import torch
from torch import nn


class CervicalHRNet(nn.Module):
    """Exact 23-channel, stride-four head used by csxa_detr_hrnet/train."""

    def __init__(self):
        super().__init__()
        self.backbone = timm.create_model(
            "hrnet_w32", features_only=True, pretrained=False, out_indices=(1,)
        )
        channels = self.backbone.feature_info.channels()[0]
        self.head = nn.Sequential(
            nn.Conv2d(channels, 256, 3, padding=1, bias=False),
            nn.BatchNorm2d(256), nn.ReLU(inplace=True),
            nn.Conv2d(256, 23, 1),
        )

    def forward(self, image):
        return self.head(self.backbone(image)[0])


def load_hrnet(checkpoint: Path):
    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    args = saved.get("args", {})
    if args.get("input_size", 384) != 384 or args.get("heatmap_size", 96) != 96:
        raise ValueError("Expected the original 384-pixel cervical HRNET checkpoint")
    model = CervicalHRNet()
    model.load_state_dict(saved["state_dict"], strict=True)
    return model.eval()


class CervicalDetector(nn.Module):
    def __init__(self, directory: Path):
        super().__init__()
        from transformers import DetrForObjectDetection
        self.network = DetrForObjectDetection.from_pretrained(
            str(directory), local_files_only=True, attn_implementation="eager"
        ).eval()
        if self.network.config.num_labels != 1:
            raise ValueError("Expected the single-spine cervical detector")

    def forward(self, pixel_values, pixel_mask):
        # Transformers 5.5's general mask factory handles language-model cache
        # positions, which cannot be traced by the TorchScript ONNX exporter.
        # DETR only needs a broadcast padding mask. Reuse every saved layer and
        # exactly the native forward operations, with this explicit mask.
        core = self.network.model
        feature_map, mask = core.backbone(pixel_values, pixel_mask)[-1]
        hidden = core.input_projection(feature_map).flatten(2).permute(0, 2, 1)
        positions = core.position_embedding(feature_map.shape, pixel_values.device,
                                            pixel_values.dtype, mask)
        padding = torch.zeros_like(mask.flatten(1), dtype=pixel_values.dtype)
        padding = padding.masked_fill(~mask.flatten(1), torch.finfo(pixel_values.dtype).min)
        padding = padding[:, None, None, :]
        for layer in core.encoder.layers:
            hidden = layer(hidden, padding, spatial_position_embeddings=positions)
        query_positions = core.query_position_embeddings.weight.unsqueeze(0).repeat(pixel_values.shape[0], 1, 1)
        queries = torch.zeros_like(query_positions)
        for layer in core.decoder.layers:
            queries = layer(queries, None, positions, query_positions, hidden,
                            encoder_attention_mask=padding)
        queries = core.decoder.layernorm(queries)
        return self.network.class_labels_classifier(queries), self.network.bbox_predictor(queries).sigmoid()

    def reference(self, pixel_values, pixel_mask):
        """Native unadapted forward used to audit the export-friendly wrapper."""
        output = self.network(pixel_values=pixel_values, pixel_mask=pixel_mask)
        return output.logits, output.pred_boxes
