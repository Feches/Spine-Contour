"""The bundled region detector: cervical and lumbar boxes in original film coordinates.

Its boxes route a film (cervical, lumbar or full spine) and frame the regional
landmark crops. They are proposals; the landmark models and crop agreement
decide what anatomy is accepted.
"""
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


# A region counts as present on the film at or above this detector score.
PRESENT_SCORE = .15
# A present box narrower than this (in film pixels) is still not a region.
MIN_SIDE = 8


def proposals(raw: np.ndarray) -> list[dict]:
    """Run the detector once. Boxes are proposals, not accepted anatomy."""
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


def regions(raw: np.ndarray, present_score: float = PRESENT_SCORE) -> dict:
    """The highest-scoring present box per region, or None, and every proposal.

    ``present_score`` is the routing gate. When the person has already said
    which regions are on the film, pass 0 to take each class's best proposal
    (the detector contract still drops anything under its score_threshold).
    """
    found = proposals(raw)
    result = {"proposals": found}
    for name in region_detector.CLASSES:
        present = sorted((p for p in found if p["class"] == name and p["score"] >= present_score),
                         key=lambda p: -p["score"])
        # Small films have narrow necks; the landmark crops add their own context.
        result[name] = next(iter(boxes(present, name, raw.shape, limit=1, min_side=MIN_SIDE)), None)
        result[f"{name}_score"] = max((p["score"] for p in present), default=None)
    return result


def boxes(found: list[dict], name: str, shape: tuple[int, int], limit=3, min_side=32):
    height, width = shape
    selected = []
    for proposal in found:
        if proposal["class"] != name:
            continue
        left, top, right, bottom = proposal["bbox"]
        box = (max(0, int(np.floor(left))), max(0, int(np.floor(top))),
               min(width, int(np.ceil(right))), min(height, int(np.ceil(bottom))))
        if box[2]-box[0] >= min_side and box[3]-box[1] >= min_side:
            selected.append(box)
            if len(selected) >= limit:
                break
    return selected
