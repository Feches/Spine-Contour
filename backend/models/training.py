"""Checkpoint builders for export and validation only; not shipped in the app."""
import segmentation_models_pytorch as smp
import torch
import torch.nn as nn
from torchvision.models.detection import keypointrcnn_resnet50_fpn
from torchvision.models.detection.keypoint_rcnn import KeypointRCNNPredictor
from .hrnet import build_hrnet_model, decode_heatmaps
from .models import (MODEL_IMAGE_SIZE, VERTEBRA_WEIGHTS_PATH, FEMORAL_WEIGHTS_PATH,
                     S1_WEIGHTS_PATH, HRNET_WEIGHTS_PATH)


def build_unet(checkpoint: dict[str, object], classes: int) -> nn.Module:
    """Build the exact ResNet-34 U-Net used for both segmentation checkpoints."""

    return smp.Unet(
        encoder_name=str(checkpoint.get("encoder", "resnet34")),
        encoder_weights=None,
        in_channels=1,
        classes=classes,
    )


def build_s1_model(size: int = MODEL_IMAGE_SIZE) -> nn.Module:
    """Build the two-keypoint R-CNN used for the S1 superior endplate."""

    model = keypointrcnn_resnet50_fpn(
        weights=None,
        weights_backbone=None,
        num_keypoints=17,
        min_size=size,
        max_size=size,
        image_mean=[0.449] * 3,
        image_std=[0.226] * 3,
        box_detections_per_img=5,
    )
    channels = model.roi_heads.keypoint_predictor.kps_score_lowres.in_channels
    model.roi_heads.keypoint_predictor = KeypointRCNNPredictor(channels, num_keypoints=2)
    return model


def load_checkpoint(kind: str, device: str) -> nn.Module:
    if kind == "vertebra":
        path, classes = VERTEBRA_WEIGHTS_PATH, 6
    elif kind == "femoral":
        path, classes = FEMORAL_WEIGHTS_PATH, 1
    elif kind == "s1":
        path, classes = S1_WEIGHTS_PATH, None
    elif kind == "hrnet":
        path, classes = HRNET_WEIGHTS_PATH, None
    else:
        raise ValueError(f"unknown model kind: {kind}")
    if not path.is_file():
        raise FileNotFoundError(f"Missing model weights: {path}")
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    if kind == "hrnet":
        model = build_hrnet_model(checkpoint)
        model.heatmap_stride = int(checkpoint["stride"])
        return model.to(torch.device(device)).eval()
    model = (
        build_s1_model(int(checkpoint.get("size", MODEL_IMAGE_SIZE)))
        if kind == "s1"
        else build_unet(checkpoint, int(classes))
    )
    model.load_state_dict(checkpoint["model"], strict=True)
    return model.to(torch.device(device)).eval()


def build_embedding_model(source: str, input_size: tuple[int, int], pooling: str) -> nn.Module:
    """The appearance encoder, from timm's pretrained catalogue (similar-cases spec, 2026-09-12,
    section 10.1). Export and parity tests only; the desktop runs its ONNX graph.

    `source` is a timm model id (stage 1: vit_small_patch14_dinov2.lvd142m, Apache 2.0);
    `input_size` is (height, width), a multiple of the patch size, and timm resamples the
    pretrained position embeddings to it; `pooling` picks the graph's single output: the class
    token ('cls') or the mean over patch tokens ('mean'). Fused attention is turned off so the
    TorchScript exporter sees plain matmuls and softmaxes.
    """
    import timm
    from timm.layers import set_fused_attn

    if pooling not in ("cls", "mean"):
        raise ValueError("pooling must be cls or mean")
    set_fused_attn(False)
    return timm.create_model(source, pretrained=True, num_classes=0, img_size=tuple(input_size),
                             global_pool="token" if pooling == "cls" else "avg")

