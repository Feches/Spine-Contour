"""Explicit research-only ONNX region proposals.

No model is bundled or selected implicitly. A request must opt in and the two
environment paths must point to the frozen graph and its matching sidecar.
Proposals are never anatomical evidence; existing downstream gates decide that.
"""
from __future__ import annotations

from functools import lru_cache
import os

import numpy as np
import onnxruntime as ort

try:
    from . import region_detector, runtime
except ImportError:  # Support running modules directly from backend/.
    import region_detector
    import runtime


@lru_cache(maxsize=1)
def _load(graph_path: str, metadata_path: str, threads: int):
    contract = region_detector.DetectorContract.from_json(metadata_path)
    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(graph_path, sess_options=options,
                                   providers=["CPUExecutionProvider"], enable_fallback=0)
    if [item.name for item in session.get_inputs()] != [contract.input_name]:
        raise ValueError("region detector graph input differs from sidecar")
    if [item.name for item in session.get_outputs()] != [contract.output_name]:
        raise ValueError("region detector graph output differs from sidecar")
    return session, contract


def proposals(raw: np.ndarray) -> list[dict]:
    """Return source-coordinate boxes, or [] when this request did not opt in."""
    if not runtime.options().learned_region_localizer:
        return []
    graph = os.environ.get("SPINE_REGION_DETECTOR_ONNX")
    metadata = os.environ.get("SPINE_REGION_DETECTOR_METADATA")
    if not graph or not metadata:
        raise ValueError("Learned region localizer requires ONNX and metadata paths")
    runtime.checkpoint()
    session, contract = _load(graph, metadata, runtime.options().inference_threads)
    try:
        from .models import models  # use the same real-image intensity preparation
    except ImportError:
        from models import models
    image = raw if raw.dtype == np.uint8 else models._robust_rescale(raw)
    runtime.report("framing", "Finding research region proposals")
    try:
        found = region_detector.detect(session, image, contract)
        runtime.record_providers("region_detector", session.get_providers())
    finally:
        if runtime.options().low_memory:
            _load.cache_clear()
    runtime.checkpoint()
    return found


def top_box(proposals: list[dict], name: str, shape: tuple[int, int]):
    """Choose the highest-scoring valid proposal of one class in source space."""
    height, width = shape
    for proposal in proposals:
        if proposal["class"] != name:
            continue
        left, top, right, bottom = proposal["bbox"]
        box = (max(0, int(np.floor(left))), max(0, int(np.floor(top))),
               min(width, int(np.ceil(right))), min(height, int(np.ceil(bottom))))
        if box[2]-box[0] >= 32 and box[3]-box[1] >= 32:
            return box
    return None
