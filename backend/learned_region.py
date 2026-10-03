"""Bundled ONNX crop proposals in original radiograph coordinates."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime as ort

try:
    from . import region_detector, runtime
except ImportError:
    import region_detector
    import runtime


MODEL_DIR = Path(__file__).resolve().parent / "onnx"
GRAPH = MODEL_DIR / "crop_detector.onnx"
METADATA = MODEL_DIR / "crop_detector.json"


@lru_cache(maxsize=4)
def _load(threads: int):
    contract = region_detector.DetectorContract.from_json(METADATA)
    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(GRAPH), sess_options=options,
                                   providers=["CPUExecutionProvider"], enable_fallback=0)
    if [item.name for item in session.get_inputs()] != [contract.input_name]:
        raise ValueError("Crop model input differs from its metadata")
    if [item.name for item in session.get_outputs()] != [contract.output_name]:
        raise ValueError("Crop model output differs from its metadata")
    return session, contract


def proposals(raw: np.ndarray) -> list[dict]:
    """Run the selected model once. Boxes are proposals, not accepted anatomy."""
    if runtime.options().crop_method != "model":
        return []
    runtime.checkpoint()
    try:
        from .models import models
    except ImportError:
        from models import models
    image = raw if raw.dtype == np.uint8 else models._robust_rescale(raw)
    session, contract = _load(runtime.options().inference_threads)
    runtime.report("framing", "Locating cervical and lumbar regions")
    try:
        found = region_detector.detect(session, image, contract)
        runtime.record_providers("crop_detector", session.get_providers())
    finally:
        if runtime.options().low_memory:
            _load.cache_clear()
    runtime.checkpoint()
    return found


def top_box(found: list[dict], name: str, shape: tuple[int, int]):
    return next(iter(boxes(found, name, shape, limit=1)), None)


def boxes(found: list[dict], name: str, shape: tuple[int, int], limit=3):
    height, width = shape
    selected = []
    for proposal in found:
        if proposal["class"] != name:
            continue
        left, top, right, bottom = proposal["bbox"]
        box = (max(0, int(np.floor(left))), max(0, int(np.floor(top))),
               min(width, int(np.ceil(right))), min(height, int(np.ceil(bottom))))
        if box[2]-box[0] >= 32 and box[3]-box[1] >= 32:
            selected.append(box)
            if len(selected) >= limit:
                break
    return selected
