"""Appearance embeddings: one general image encoder, exported to ONNX like the structure models.
The record carries a lumbar crop, a cervical crop and the whole film, chosen by the film's region
(similar-cases spec, 2026-09-12, section 10; stage 2, 2026-09-30, sections 8 and 9).

Nothing about the encoder is hard-coded here. Input size, channels, mean, standard deviation,
output dimension and pooling all come from backend/onnx/embed.json, so swapping the network is a
re-export, not new code (spec decision 4). The graph is loaded, cached and released by the same
InferenceModel machinery as the four structure models, under the kind "embed".
"""
from __future__ import annotations

from functools import lru_cache
import json

import cv2
import numpy as np

try:
    from . import runtime
    from .models import models
except ImportError:  # Support `uvicorn server:app` from backend/.
    import runtime
    from models import models

class EmbeddingUnavailable(RuntimeError):
    """The bundled encoder cannot be used: its metadata is missing, unreadable or incomplete (a
    broken install, never a bad request)."""


EMBED_KIND = "embed"
REQUIRED_KEYS = ("input", "channels", "dim", "pooling", "mean", "std", "onnx_sha256", "source")


@lru_cache(maxsize=1)
def load_metadata() -> dict:
    """embed.json beside the graph. Cached for the process: it changes only with a re-export."""
    path = models.ONNX_DIRECTORY / f"{EMBED_KIND}.json"
    if not path.is_file():
        raise EmbeddingUnavailable(f"Missing embedding metadata: {path}. Run python tools/export_onnx.py --kind embed.")
    try:
        metadata = json.loads(path.read_text())
    except ValueError as error:
        raise EmbeddingUnavailable(f"embed.json could not be read: {error}") from error
    for key in REQUIRED_KEYS:
        if key not in metadata:
            raise EmbeddingUnavailable(f"embed.json is missing '{key}'")
    return metadata


def model_record(metadata: dict) -> dict:
    """What every stored embedding says produced it (spec section 11)."""
    return {"id": str(metadata["source"]), "dim": int(metadata["dim"]),
            "input": [int(v) for v in metadata["input"]], "onnx_sha256": str(metadata["onnx_sha256"])}


def preprocess(image: np.ndarray, metadata: dict) -> np.ndarray:
    """Letterbox the film into the encoder's frame the way the structure models are fed.

    The models' own robust 8-bit rescale, a zero-padded letterbox to metadata['input'] (height,
    width), the one channel repeated to metadata['channels'], scaled to [0, 1] and normalised by
    the encoder's mean and standard deviation. float32, shape 1 x channels x height x width.
    """
    height, width = (int(v) for v in metadata["input"])
    channels = int(metadata["channels"])
    gray = models._robust_rescale(image)
    scale = min(height / gray.shape[0], width / gray.shape[1])
    resized_height = max(1, int(round(gray.shape[0] * scale)))
    resized_width = max(1, int(round(gray.shape[1] * scale)))
    resized = cv2.resize(gray, (resized_width, resized_height), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((height, width), dtype=np.uint8)
    top = (height - resized_height) // 2
    left = (width - resized_width) // 2
    canvas[top:top + resized_height, left:left + resized_width] = resized
    value = canvas.astype(np.float32) / np.float32(255.0)
    stacked = np.repeat(value[None, None], channels, axis=1)
    mean = np.asarray(metadata["mean"], dtype=np.float32).reshape(1, channels, 1, 1)
    std = np.asarray(metadata["std"], dtype=np.float32).reshape(1, channels, 1, 1)
    return ((stacked - mean) / std).astype(np.float32)


REGIONS = ("lumbar", "cervical", "full_spine")


def crop_window(image: np.ndarray, window, *, xywh: bool = False) -> np.ndarray | None:
    """The film cut by `window`, clipped to the film: corners [left, top, right, bottom], or with
    `xywh` the cervical pipeline's [x, y, width, height] (spec 2026-09-30, section 8). None -- never
    the whole film standing in for a crop -- when the window is absent, malformed or degenerate."""
    if not isinstance(window, (list, tuple)) or len(window) != 4:
        return None
    try:
        values = [float(v) for v in window]
    except (TypeError, ValueError):
        return None
    if xywh:
        x0, y0, w, h = values
        x1, y1 = x0 + w, y0 + h
    else:
        x0, y0, x1, y1 = values
    x0, y0, x1, y1 = (int(round(v)) for v in (x0, y0, x1, y1))
    height, width = image.shape[:2]
    x0, x1 = max(0, min(x0, width)), max(0, min(x1, width))
    y0, y1 = max(0, min(y0, height)), max(0, min(y1, height))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None
    return image[y0:y1, x0:x1]


def region_crops(image: np.ndarray, framing, region: str) -> dict:
    """The lumbar and cervical crops a region's framing record locates (spec section 8): a lumbar
    result's `window` is the lumbar crop; a cervical result's `window` (x, y, width, height) is the
    cervical crop; a full-spine result names both under `lumbar_window` and `cervical_window`."""
    framing = framing if isinstance(framing, dict) else {}
    if region == "cervical":
        return {"lumbar": None, "cervical": crop_window(image, framing.get("window"), xywh=True)}
    if region == "full_spine":
        return {"lumbar": crop_window(image, framing.get("lumbar_window")),
                "cervical": crop_window(image, framing.get("cervical_window"))}
    return {"lumbar": crop_window(image, framing.get("window")), "cervical": None}


def embed(image: np.ndarray, metadata: dict | None = None) -> list[float]:
    """One unit-length embedding of one image through the bundled graph, rounded to five decimals.
    Reported under whatever stage the caller last reported: _infer re-emits it while loading."""
    metadata = metadata or load_metadata()
    value = preprocess(image, metadata)
    output = models._infer(EMBED_KIND, lambda model: model.run(None, {"image": value}), None)[0]
    vector = np.asarray(output, dtype=np.float32).reshape(-1)
    if vector.shape[0] != int(metadata["dim"]):
        raise ValueError(f"The embedding graph returned {vector.shape[0]} values; embed.json says {metadata['dim']}")
    norm = float(np.linalg.norm(vector))
    if not np.isfinite(norm) or norm == 0.0:
        raise ValueError("The embedding graph returned a degenerate vector")
    return [round(float(v), 5) for v in vector / norm]


def embedding_record(image: np.ndarray, framing, region: str = "lumbar") -> dict:
    """{model, lumbar, cervical, whole, region} for one film (spec 2026-09-30, sections 8 and 9):
    each crop vector None where the region has no such window; `whole` always. Raises ValueError for
    an unknown region and EmbeddingUnavailable without the graph; the callers decide what fails."""
    if region not in REGIONS:
        raise ValueError(f"Unknown region {region!r}; available: {', '.join(REGIONS)}")
    metadata = load_metadata()
    crops = region_crops(image, framing, region)
    return {"model": model_record(metadata),
            "lumbar": embed(crops["lumbar"], metadata) if crops["lumbar"] is not None else None,
            "cervical": embed(crops["cervical"], metadata) if crops["cervical"] is not None else None,
            "whole": embed(image, metadata),
            "region": region}
