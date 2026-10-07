"""Experimental whole-film classifier; no crop search or landmark inference.

The model suggests a region, never anatomical orientation or measurement
quality. Unsupported and uncertain views require manual selection.
"""
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import time

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

try:
    from . import runtime
except ImportError:
    import runtime

MODEL_DIRECTORY = Path(__file__).resolve().parent / "onnx"
CLASSES = ("cervical_lateral", "lumbar_lateral", "full_spine_lateral", "lumbar_ap", "other")
REGIONS = {"cervical_lateral": "cervical", "lumbar_lateral": "lumbar",
           "full_spine_lateral": "full_spine"}


def prepare_image(pixels):
    """Match training's whole-image 224px grayscale letterbox exactly."""
    raw = np.asarray(pixels)
    if (raw.ndim != 2 or not raw.size or not np.issubdtype(raw.dtype, np.number)
            or not np.isfinite(raw).all()):
        raise ValueError("Expected finite two-dimensional grayscale pixels")
    if raw.dtype != np.uint8:
        # Match the app's DICOM intensity convention without changing 8-bit PNGs.
        try:
            from .models.models import _robust_rescale
        except ImportError:
            from models.models import _robust_rescale
        raw = _robust_rescale(raw)
    image = ImageOps.contain(Image.fromarray(raw), (224, 224), Image.Resampling.BILINEAR)
    canvas = Image.new("L", (224, 224))
    canvas.paste(image, ((224-image.width)//2, (224-image.height)//2))
    tensor = np.repeat(np.asarray(canvas, dtype=np.float32)[None], 3, axis=0)/255
    tensor = (tensor-np.array([.485, .456, .406], np.float32)[:, None, None]) / np.array(
        [.229, .224, .225], np.float32)[:, None, None]
    return np.ascontiguousarray(tensor[None])


@lru_cache(maxsize=1)
def _load(threads):
    path = MODEL_DIRECTORY / "view_classifier.onnx"
    try:
        metadata = json.loads((MODEL_DIRECTORY / "view_classifier.json").read_text())
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as error:
        raise ValueError("The view classifier is not installed. Select Landmark search in Processing settings.") from error
    if (metadata.get("classes") != list(CLASSES) or metadata.get("sha256") != digest
            or not .01 <= metadata.get("temperature", 0) <= 10
            or not .5 <= metadata.get("threshold", 0) <= 1):
        raise ValueError("View classifier files are invalid. Select Landmark search in Processing settings.")
    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(path), sess_options=options,
                                   providers=["CPUExecutionProvider"])
    return session, metadata


def decision(logits, metadata):
    values = np.asarray(logits, dtype=np.float64).reshape(-1)
    if values.shape != (len(CLASSES),) or not np.isfinite(values).all():
        raise ValueError("View classifier returned invalid scores")
    values = values/metadata["temperature"]
    probabilities = np.exp(values-values.max())
    probabilities /= probabilities.sum()
    index = int(probabilities.argmax())
    label, score = CLASSES[index], float(probabilities[index])
    region = REGIONS.get(label) if score >= metadata["threshold"] else None
    return region, {"label": label, "score": score,
                    "probabilities": dict(zip(CLASSES, map(float, probabilities))),
                    "threshold": metadata["threshold"], "model_sha256": metadata["sha256"],
                    "version": metadata["version"]}


def detect_film(pixel_array, anterior_side=None):
    if anterior_side not in (None, "", "auto", "left", "right"):
        raise ValueError("anterior_side must be auto, left or right")
    start = time.perf_counter()
    tensor = prepare_image(pixel_array)
    raw = np.asarray(pixel_array)
    side = anterior_side if anterior_side in ("left", "right") else None
    qc = {"method": "whole_film_classifier", "requires_review": True,
          "filename_used": False, "reference_landmarks_used": False,
          "scores_are_calibrated_confidence": False,
          "orientation": {"status": "user_selected" if side else "needs_selection"}}
    if min(raw.shape) < 32 or np.ptp(raw.astype(np.float64)) == 0:
        return {"body_part": None, "anterior_side": side, "status": "needs_selection",
                "qc": {**qc, "reason": "no_usable_image_content"},
                "warnings": ["No usable image content. Choose a radiograph and film region manually."]}
    runtime.report("detecting", "Classifying the whole film")
    try:
        session, metadata = _load(runtime.options().inference_threads)
        runtime.record_providers("view_classifier", session.get_providers())
        output = session.run(["logits"], {"image": tensor})[0]
        runtime.checkpoint()
        region, classification = decision(output, metadata)
    finally:
        if runtime.options().low_memory:
            _load.cache_clear()
    classification["elapsed_ms"] = round((time.perf_counter()-start)*1000, 2)
    if region:
        warnings = ["Review the automatically detected film region and orientation before accepting measurements."]
        if region == "cervical" and side is None:
            warnings.append("Choose whether anterior is on the left or right of this image.")
    elif classification["label"] == "lumbar_ap":
        warnings = ["This looks like a lumbar AP film. The available measurements require a lateral film. Check the image and select its region manually."]
    elif classification["label"] == "other":
        warnings = ["This image may not be a supported spine view. Check the image and select its region manually."]
    else:
        warnings = ["The view classifier is uncertain. Choose cervical, lumbar or standing / full spine manually."]
    return {"body_part": region, "anterior_side": side,
            "status": "detected" if region else "needs_selection", "qc": qc,
            "classification": classification, "warnings": warnings}
