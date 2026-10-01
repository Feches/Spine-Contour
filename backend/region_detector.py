"""ONNX region proposals in source-film coordinates.

This is an inference adapter, not an anatomical acceptance rule. Its sidecar
metadata must describe the exported graph exactly; no output shape or class
order is inferred from a model file. A missed region returns an empty list.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import cv2
import numpy as np


CLASSES = ("cervical", "lumbar")
LAYOUTS = ("xyxy_score_class_rows", "cxcywh_class_scores_channels")


@dataclass(frozen=True)
class DetectorContract:
    input_name: str
    output_name: str
    input_size: tuple[int, int]  # height, width
    channels: int
    pixel_normalization: str
    letterbox_value: int
    output_layout: str
    box_units: str
    classes: tuple[str, str]
    score_threshold: float
    nms_iou_threshold: float

    @classmethod
    def from_json(cls, path: str | Path) -> DetectorContract:
        return cls.from_dict(json.loads(Path(path).read_text()))

    @classmethod
    def from_dict(cls, data: dict) -> DetectorContract:
        expected = {"schema_version", "input_name", "output_name", "input_size", "channels",
                    "pixel_normalization", "letterbox_value", "output_layout", "box_units",
                    "classes", "score_threshold", "nms_iou_threshold"}
        if not isinstance(data, dict) or set(data) != expected or data.get("schema_version") != 1:
            raise ValueError("region detector metadata has unknown or missing fields, or unsupported schema")
        size = data["input_size"]
        if (not isinstance(size, list) or len(size) != 2 or
                any(type(x) is not int or x < 32 for x in size)):
            raise ValueError("input_size must be [height, width] with dimensions >= 32")
        if not all(isinstance(data[key], str) and data[key] for key in ("input_name", "output_name")):
            raise ValueError("input_name and output_name must be nonempty strings")
        if data["channels"] not in (1, 3) or type(data["channels"]) is not int:
            raise ValueError("channels must be 1 or 3")
        if data["pixel_normalization"] != "uint8_div_255":
            raise ValueError("unsupported pixel normalization")
        if type(data["letterbox_value"]) is not int or not 0 <= data["letterbox_value"] <= 255:
            raise ValueError("letterbox_value must be a uint8 value")
        if data["output_layout"] not in LAYOUTS or data["box_units"] not in ("input_pixels", "normalized"):
            raise ValueError("unsupported output layout or box units")
        if not isinstance(data["classes"], list) or tuple(data["classes"]) != CLASSES:
            raise ValueError("classes must be ordered ['cervical', 'lumbar']")
        for key in ("score_threshold", "nms_iou_threshold"):
            value = data[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value) or not 0 < value < 1:
                raise ValueError(f"{key} must be finite and strictly between zero and one")
        return cls(data["input_name"], data["output_name"], tuple(size), data["channels"],
                   data["pixel_normalization"], data["letterbox_value"], data["output_layout"],
                   data["box_units"], tuple(data["classes"]), float(data["score_threshold"]),
                   float(data["nms_iou_threshold"]))


@dataclass(frozen=True)
class Letterbox:
    scale: float
    x_scale: float
    y_scale: float
    left: int
    top: int
    width: int
    height: int


def prepare(image: np.ndarray, contract: DetectorContract) -> tuple[np.ndarray, Letterbox]:
    """Make NCHW float32 input from a uint8 grayscale film, retaining exact padding."""
    source = np.asarray(image)
    if source.ndim != 2 or source.dtype != np.uint8 or not source.size:
        raise ValueError("region detector input must be a nonempty uint8 grayscale image")
    height, width = source.shape
    target_h, target_w = contract.input_size
    scale = min(target_h / height, target_w / width)
    resized_h = min(target_h, max(1, round(height * scale)))
    resized_w = min(target_w, max(1, round(width * scale)))
    resized = cv2.resize(source, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR)
    top, left = (target_h - resized_h) // 2, (target_w - resized_w) // 2
    canvas = np.full((target_h, target_w), contract.letterbox_value, dtype=np.uint8)
    canvas[top:top + resized_h, left:left + resized_w] = resized
    tensor = canvas.astype(np.float32)[None, None] / np.float32(255)
    if contract.channels == 3:
        tensor = np.repeat(tensor, 3, axis=1)
    return tensor, Letterbox(scale, resized_w / width, resized_h / height,
                             left, top, width, height)


def _rows(output: np.ndarray, contract: DetectorContract) -> np.ndarray:
    value = np.asarray(output)
    if value.ndim == 3:
        if value.shape[0] != 1:
            raise ValueError("region detector output batch must be one")
        value = value[0]
    if value.ndim != 2 or not np.issubdtype(value.dtype, np.number):
        raise ValueError("region detector output must be a numeric rank-two or batch-one rank-three array")
    if contract.output_layout == "xyxy_score_class_rows":
        if value.shape[1] != 6:
            raise ValueError("xyxy_score_class_rows requires [N, 6]")
        return value.astype(np.float64)
    if value.shape[0] != 6:
        raise ValueError("cxcywh_class_scores_channels requires [6, N]")
    channels = value.astype(np.float64)
    scores = channels[4:6]
    finite_scores = np.where(np.isfinite(scores), scores, -np.inf)
    classes = finite_scores.argmax(axis=0)
    confidence = finite_scores[classes, np.arange(channels.shape[1])]
    confidence = np.where(np.isfinite(scores).all(axis=0), confidence, np.nan)
    cx, cy, width, height = channels[:4]
    return np.column_stack((cx - width / 2, cy - height / 2,
                            cx + width / 2, cy + height / 2, confidence, classes))


def _iou(a: np.ndarray, b: np.ndarray) -> float:
    top_left = np.maximum(a[:2], b[:2])
    bottom_right = np.minimum(a[2:], b[2:])
    overlap = np.prod(np.maximum(0, bottom_right - top_left))
    area_a = np.prod(a[2:] - a[:2])
    area_b = np.prod(b[2:] - b[:2])
    return float(overlap / (area_a + area_b - overlap))


def decode(output: np.ndarray, contract: DetectorContract, transform: Letterbox) -> list[dict]:
    """Filter, invert letterbox, clip, then suppress overlapping boxes per class."""
    rows = _rows(output, contract)
    candidates = []
    target_h, target_w = contract.input_size
    for x1, y1, x2, y2, score, class_id in rows:
        if (not np.isfinite((x1, y1, x2, y2, score, class_id)).all()
                or score < contract.score_threshold or score > 1
                or class_id not in (0, 1) or x2 <= x1 or y2 <= y1):
            continue
        box = np.array((x1, y1, x2, y2), dtype=np.float64)
        if contract.box_units == "normalized":
            box *= (target_w, target_h, target_w, target_h)
        box -= (transform.left, transform.top, transform.left, transform.top)
        box /= (transform.x_scale, transform.y_scale, transform.x_scale, transform.y_scale)
        box[[0, 2]] = np.clip(box[[0, 2]], 0, transform.width)
        box[[1, 3]] = np.clip(box[[1, 3]], 0, transform.height)
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        candidates.append({"class": contract.classes[int(class_id)], "score": float(score),
                           "bbox": box.tolist()})
    candidates.sort(key=lambda item: -item["score"])
    retained = []
    for proposal in candidates:
        if any(proposal["class"] == prior["class"] and
               _iou(np.asarray(proposal["bbox"]), np.asarray(prior["bbox"])) > contract.nms_iou_threshold
               for prior in retained):
            continue
        retained.append(proposal)
    return retained


def detect(session, image: np.ndarray, contract: DetectorContract) -> list[dict]:
    """Run a supplied ONNX Runtime session (or compatible session wrapper) once."""
    tensor, transform = prepare(image, contract)
    outputs = session.run([contract.output_name], {contract.input_name: tensor})
    if len(outputs) != 1:
        raise ValueError("region detector session returned an unexpected output count")
    return decode(outputs[0], contract, transform)
