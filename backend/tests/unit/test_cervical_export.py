"""Small synthetic networks verify the export adapter without loading weights."""
from pathlib import Path

import pytest

torch = pytest.importorskip("torch")
transformers = pytest.importorskip("transformers")

from backend.models.cervical_training import CervicalDetector, load_hrnet


def test_hrnet_loader_rejects_a_different_input_checkpoint(monkeypatch):
    monkeypatch.setattr(torch, "load", lambda *a, **kw: {"args": {"input_size": 512}})
    with pytest.raises(ValueError, match="384-pixel"):
        load_hrnet(Path("unneeded.pt"))


@pytest.mark.parametrize("height,width", [(64, 96), (96, 64)])
def test_detector_export_wrapper_equals_native_with_real_padding_mask(monkeypatch, height, width):
    torch.manual_seed(71)
    config = transformers.DetrConfig(
        backbone_config={"model_type": "timm_backbone", "backbone": "resnet18",
                         "features_only": True, "use_pretrained_backbone": False,
                         "out_indices": [1, 2, 3, 4]},
        d_model=32, encoder_layers=1, decoder_layers=1,
        encoder_attention_heads=4, decoder_attention_heads=4,
        encoder_ffn_dim=64, decoder_ffn_dim=64, num_queries=5,
        id2label={0: "spine"}, label2id={"spine": 0},
    )
    config._attn_implementation = "eager"
    network = transformers.DetrForObjectDetection(config).eval()
    monkeypatch.setattr(transformers.DetrForObjectDetection, "from_pretrained", lambda *a, **kw: network)
    adapted = CervicalDetector(Path("unneeded"))
    value = torch.rand(1, 3, height, width)
    mask = torch.ones(1, height, width, dtype=torch.int64)
    mask[:, -16:, :] = 0
    with torch.inference_mode():
        native = adapted.reference(value, mask)
        exported = adapted(value, mask)
    for first, second in zip(native, exported):
        torch.testing.assert_close(first, second, rtol=1e-5, atol=1e-6)
