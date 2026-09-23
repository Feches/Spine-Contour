"""ONNX inference for the 23-landmark cervical HRNET model.

The paired cervical DETR finds the crop without reference landmarks. The original
model labels image-left/image-right, so anatomical naming requires an explicit
anterior side supplied by the user. No segmentation mask is inferred.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image

from . import models
try:
    from .. import runtime
except ImportError:
    import runtime


MODEL_NAME = "cervical_hrnet"
LANDMARK_NAMES = (
    "C2 bottom left", "C2 bottom right", "C2 centroid",
) + tuple(f"C{level} {vertical} {side}" for level in range(3, 8)
          for vertical in ("top", "bottom") for side in ("left", "right"))
IMAGENET_MEAN = np.array([.485, .456, .406], np.float32)[:, None, None]
IMAGENET_STD = np.array([.229, .224, .225], np.float32)[:, None, None]
DETECTION_THRESHOLD = .05


def _rgb_tensor(image):
    rgb = np.repeat(image[..., None], 3, axis=2) if image.ndim == 2 else image
    tensor = rgb.transpose(2, 0, 1).astype(np.float32) / np.float32(255.)
    return np.ascontiguousarray(((tensor - IMAGENET_MEAN) / IMAGENET_STD)[None])


def detector_size(height, width, shortest=800, longest=1333):
    """Hugging Face DETR's aspect-preserving size calculation, including rounding."""
    size, raw_size = shortest, None
    if max(height, width) / min(height, width) * size > longest:
        raw_size = longest * min(height, width) / max(height, width)
        size = int(round(raw_size))
    if min(height, width) == size:
        return height, width
    if width < height:
        return int((raw_size if raw_size is not None else size) * height / width), size
    return size, int((raw_size if raw_size is not None else size) * width / height)


def detector_input(image):
    height, width = detector_size(*image.shape[:2])
    resized = resize_detector_image(image, (height, width))
    return {"pixel_values": _rgb_tensor(resized),
            "pixel_mask": np.ones((1, height, width), dtype=np.int64)}


def resize_detector_image(image, size):
    """Torchvision's float bilinear antialias filter, without a Torch dependency.

    DETR's tensor processor rounds to uint8 once after both separable passes.
    Pillow rounds between passes, changing many pixels by one intensity level.
    Float-rounding ties may still differ by one level across numeric runtimes.
    """
    def resize_axis(array, count, axis):
        array = np.moveaxis(array, axis, 0)
        original = array.shape[0]
        if original == count:
            return np.moveaxis(array, 0, axis)
        scale = original / count
        support = max(1., scale)
        output = np.empty((count, *array.shape[1:]), np.float32)
        for index in range(count):
            center = (index+.5)*scale
            start = max(0, int(center-support+.5))
            stop = min(original, int(center+support+.5))
            positions = np.arange(start, stop, dtype=np.float32)
            weights = np.maximum(0., 1.-np.abs((positions+.5-center)/support))
            weights /= weights.sum()
            output[index] = np.tensordot(weights, array[start:stop], axes=(0, 0))
        return np.moveaxis(output, 0, axis)

    value = resize_axis(np.asarray(image, np.float32), size[1], 1)
    value = resize_axis(value, size[0], 0)
    return np.clip(np.rint(value), 0, 255).astype(np.uint8)


def detection_from_output(logits, boxes, shape, threshold=DETECTION_THRESHOLD):
    """Select highest foreground score; never turn a missed detection into a crop."""
    logits, boxes = np.asarray(logits), np.asarray(boxes)
    if logits.ndim != 3 or logits.shape[0] != 1 or logits.shape[-1] != 2:
        raise ValueError("Invalid cervical detector logits")
    if boxes.shape != (1, logits.shape[1], 4):
        raise ValueError("Invalid cervical detector boxes")
    if not logits.shape[1]:
        return None
    valid = np.isfinite(logits[0]).all(1) & np.isfinite(boxes[0]).all(1)
    safe_logits = np.where(np.isfinite(logits[0]), logits[0], 0)
    probabilities = np.exp(safe_logits - safe_logits.max(1, keepdims=True))
    scores = probabilities[:, 0] / probabilities.sum(1)
    valid &= (scores > threshold) & (boxes[0, :, 2:] > 0).all(1)
    if not valid.any():
        return None
    index = int(np.argmax(np.where(valid, scores, -np.inf)))
    cx, cy, width, height = boxes[0, index]
    h, w = shape[:2]
    bbox = np.array([cx-width/2, cy-height/2, cx+width/2, cy+height/2]) * [w, h, w, h]
    if bbox[2] <= 0 or bbox[3] <= 0 or bbox[0] >= w or bbox[1] >= h:
        return None
    return {"bbox": bbox, "score": float(scores[index])}


@dataclass(frozen=True)
class CropTransform:
    x0: int
    y0: int
    x1: int
    y1: int

    def restore(self, points, heatmap_shape=(96, 96)):
        h, w = heatmap_shape
        return np.asarray(points, np.float64) * [(self.x1-self.x0)/w, (self.y1-self.y0)/h] + [self.x0, self.y0]

    @property
    def window(self):
        return [self.x0, self.y0, self.x1-self.x0, self.y1-self.y0]


def landmark_input(image, bbox):
    """Original evaluation crop: scale1.2, pad8% per side, square then edge trim.

    Retain the actual integer sampled window for inverse coordinates. The old
    evaluator used its pre-rounded floating window, introducing subpixel drift.
    """
    height, width = image.shape[:2]
    x1, y1, x2, y2 = np.asarray(bbox, np.float64)
    if not np.isfinite([x1, y1, x2, y2]).all() or x2 <= x1 or y2 <= y1:
        return None
    cx, cy = (x1+x2)/2, (y1+y2)/2
    side = max(x2-x1, y2-y1) * 1.2 * 1.16
    x0, y0 = max(0., min(width-1., cx-side/2)), max(0., min(height-1., cy-side/2))
    side = min(side, width-x0, height-y0)
    transform = CropTransform(int(x0), int(y0), int(x0+side), int(y0+side))
    if transform.x1 <= transform.x0 or transform.y1 <= transform.y0:
        return None
    crop = image[transform.y0:transform.y1, transform.x0:transform.x1]
    resized = np.asarray(Image.fromarray(crop).resize((384, 384), Image.Resampling.BILINEAR))
    return _rgb_tensor(resized), transform


def decode_heatmaps(heatmaps):
    heat = np.asarray(heatmaps)
    if heat.shape != (1, 23, 96, 96):
        raise ValueError("Invalid cervical HRNET heatmap shape")
    if not np.isfinite(heat).all():
        raise ValueError("Cervical HRNET returned non-finite heatmaps")
    indices = heat.reshape(1, 23, -1).argmax(-1)[0]
    return np.stack([indices % 96, indices // 96], axis=-1).astype(np.float64)


def landmark_contract(points, anterior_side):
    if anterior_side not in ("left", "right"):
        raise ValueError("Cervical anterior_side must be left or right")
    p = np.asarray(points, np.float64)
    if p.shape != (23, 2) or not np.isfinite(p).all():
        raise ValueError("Expected 23 finite cervical landmarks")
    order = [0, 1] if anterior_side == "left" else [1, 0]
    def pair(a, b):
        if np.linalg.norm(p[a]-p[b]) < 1e-6:
            return None
        return [p[(a, b)[i]].tolist() for i in order]

    bodies = {"C2": {"superior": None, "inferior": pair(0, 1), "quadrilateral": None}}
    reasons = []
    if bodies["C2"]["inferior"] is None:
        reasons.append("C2 inferior endplate collapsed to one point; review or place its endpoints.")
    for level in range(3, 8):
        offset = 3+(level-3)*4
        superior, inferior = pair(offset, offset+1), pair(offset+2, offset+3)
        bodies[f"C{level}"] = {"superior": superior, "inferior": inferior,
                               "quadrilateral": ([superior[0], superior[1], inferior[1], inferior[0]]
                                                 if superior is not None and inferior is not None else None)}
        for name, endplate in (("superior", superior), ("inferior", inferior)):
            if endplate is None:
                reasons.append(f"C{level} {name} endplate collapsed to one point; review or place its endpoints.")
    return {"region": "cervical", "anterior_side": anterior_side,
            "c2_centroid": p[2].tolist(), "vertebrae": bodies, "review_reasons": reasons}


def cervical_prediction(pixel_array, anterior_side, model=MODEL_NAME):
    """Return source-coordinate landmarks, without fabricated body masks or T1."""
    if anterior_side not in ("left", "right"):
        raise ValueError("Select whether anterior is on the left or right of this cervical image")
    if model != MODEL_NAME:
        raise ValueError("The available cervical model is cervical_hrnet (HRNET)")
    raw = np.asarray(pixel_array)
    if raw.ndim != 2 or not np.issubdtype(raw.dtype, np.number) or not raw.size:
        raise ValueError("pixel_array must be a non-empty two-dimensional numeric grayscale array")
    # Keep CSXA's original 8-bit intensities. Higher-bit clinical inputs use the
    # existing explicit radiograph rescale, shared with the application's viewer.
    image = raw.copy() if raw.dtype == np.uint8 else models._robust_rescale(raw)
    runtime.report("preparing", "Preparing the cervical radiograph")
    inputs = detector_input(image)
    logits, boxes = models._infer("cervical_detr", lambda session: session.run(None, inputs),
                                  "Locating the cervical spine")
    detected = detection_from_output(logits, boxes, image.shape)
    contract = {"region": "cervical", "anterior_side": anterior_side,
                "c2_centroid": None, "vertebrae": {}}
    framing = {"detector": "cervical_detr", "window": None, "detector_confidence": None,
               "reference_landmarks_used": False, "fallback_whole_film": False}
    warnings = []
    prepared = landmark_input(image, detected["bbox"]) if detected is not None else None
    if prepared is None:
        warnings.append("The cervical detector did not find a usable cervical spine region; no landmarks were generated.")
    else:
        tensor, transform = prepared
        heat = models._infer("cervical_hrnet", lambda session: session.run(None, {"image": tensor})[0],
                            "Predicting C2–C7 landmarks")
        points = transform.restore(decode_heatmaps(heat))
        contract = landmark_contract(points, anterior_side)
        warnings.extend(contract["review_reasons"])
        framing.update(window=transform.window, detector_confidence=detected["score"],
                       detector_bbox=detected["bbox"].tolist())
    return {"image": image, "mask": np.zeros(image.shape, np.uint8),
            "femoral_mask": np.zeros(image.shape, np.uint8), "landmarks": contract,
            "models": {"vertebrae": MODEL_NAME, "cervical": MODEL_NAME, "detector": "cervical_detr"},
            "framing": framing, "warnings": warnings,
            "provenance": {"dataset": "CSXA", "anterior_side_source": "user",
                           "landmark_coordinates": "source_image_pixels",
                           "segmentation_available": False}}
