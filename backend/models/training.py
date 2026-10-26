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

