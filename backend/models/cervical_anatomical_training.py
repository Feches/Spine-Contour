"""HRNet-W32 high-resolution heatmap head."""
from __future__ import annotations

import torch
from torch import nn
import timm


class HRNetKeypointModel(nn.Module):
    def __init__(self, model_name: str, keypoint_count: int, pretrained: bool = True):
        super().__init__()
        self.backbone = timm.create_model(model_name, pretrained=pretrained)
        high_resolution_channels = int(self.backbone.incre_modules[0][0].conv1.in_channels)
        self.head = nn.Sequential(
            nn.Conv2d(high_resolution_channels, 64, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, keypoint_count, kernel_size=1),
        )
        nn.init.normal_(self.head[-1].weight, std=0.001)
        nn.init.zeros_(self.head[-1].bias)

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        x = self.backbone.conv1(image)
        x = self.backbone.bn1(x)
        x = self.backbone.act1(x)
        x = self.backbone.conv2(x)
        x = self.backbone.bn2(x)
        x = self.backbone.act2(x)
        branches = self.backbone.stages(x)
        return self.head(branches[0])
