"""Crop marks a person places on the original film, used in place of the region detector.

Two marks, each two points in original-film pixels:

- ``s1``: the superior endplate of S1 (its two superior corners, either order). The lumbar crop is
  framed from it the way the training films were cut around S1 (``framing.reframe``), on lumbar
  and full-spine films alike.
- ``neck``: the top of C2 and the bottom of C7. The neck box is the square on that span.

Marks only frame crops. The landmark models still read the anatomy, crop agreement still gates
it, and the S1 detector still has to corroborate the lumbar HRNET's S1, so a careless mark is
withheld or flagged rather than trusted.
"""
from __future__ import annotations

import json

import numpy as np

try:
    from . import framing
except ImportError:  # Support `uvicorn server:app` from backend/.
    import framing

MIN_NECK_PX = 16


def parse(text: str | None) -> dict | None:
    """The marks from the request's JSON, or None. Raises ValueError for anything malformed."""
    if text is None or not str(text).strip():
        return None
    try:
        value = json.loads(text)
    except (TypeError, ValueError) as error:
        raise ValueError("Crop marks must be JSON") from error
    if not isinstance(value, dict) or set(value) - {"s1", "neck"}:
        raise ValueError("Crop marks may only name s1 and neck")
    marks = {}
    for name in ("s1", "neck"):
        points = value.get(name)
        if points is None:
            marks[name] = None
            continue
        array = np.asarray(points, dtype=np.float64) if isinstance(points, list) else None
        if array is None or array.shape != (2, 2) or not np.isfinite(array).all():
            raise ValueError(f"The {name} crop mark must be two [x, y] points")
        marks[name] = array
    return marks if any(v is not None for v in marks.values()) else None


def check(marks: dict | None, shape: tuple[int, int]) -> None:
    """Marks must lie on the film and span enough pixels to frame a crop."""
    if not marks:
        return
    height, width = shape
    for name, points in marks.items():
        if points is None:
            continue
        if ((points[:, 0] < 0) | (points[:, 0] > width - 1) | (points[:, 1] < 0) | (points[:, 1] > height - 1)).any():
            raise ValueError(f"The {name} crop mark lies outside the film")
        length = float(np.linalg.norm(points[1] - points[0]))
        if length < (framing.MIN_ENDPLATE_PX if name == "s1" else MIN_NECK_PX):
            raise ValueError(f"The {name} crop mark is too short to frame a crop")


def neck_box(points, shape) -> tuple[int, int, int, int]:
    """The square on the C2–C7 span, in the detector's box form (left, top, right, bottom)."""
    height, width = shape
    points = np.asarray(points, np.float64)
    side = float(np.linalg.norm(points[1] - points[0]))
    cx, cy = points.mean(0)
    return (max(0, int(round(cx - side / 2))), max(0, int(round(cy - side / 2))),
            min(width, int(round(cx + side / 2))), min(height, int(round(cy + side / 2))))


def s1_frame(points, shape):
    """The lumbar crop the training corpus frames around this S1 endplate, or None."""
    return framing.reframe(np.asarray(points, np.float64), shape)


def public(marks: dict | None) -> dict | None:
    return None if not marks else {name: None if points is None else points.tolist() for name, points in marks.items()}
