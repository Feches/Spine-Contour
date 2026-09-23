"""Global C7–S1 SVA from explicit landmarks in original-image coordinates.

Definition: SDSG Radiographic Measurement Manual, Overall Sagittal Balance,
printed page 89 and glossary page 110, hosted by the Scoliosis Research Society:
https://www.srs.org/Files/Research/Manuals-and-Publications/sdsg-radiographic-measuremnt-manual.pdf

The horizontal reference is perpendicular to the acquisition image's vertical
edge. No line is rotated to match the sacral endplate or vertebral alignment.
"""

from __future__ import annotations

import copy
import math
from numbers import Real

import numpy as np


def _numeric_array(value, shape, name):
    """Reject malformed coordinates, including booleans hidden in mixed lists."""
    try:
        raw = np.asarray(value, dtype=object)
        if raw.shape != shape or any(
            not isinstance(item, Real) or isinstance(item, (bool, np.bool_))
            for item in raw.flat
        ):
            raise ValueError
        result = raw.astype(np.float64)
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError(f"{name} must contain finite numeric values with shape {shape}") from error
    if not np.isfinite(result).all():
        raise ValueError(f"{name} must contain finite numeric values")
    return result


def _points(value, shape, name, bounds):
    if value is None:
        return None
    points = _numeric_array(value, shape, name)
    if (points < 0).any() or (bounds is not None and (points >= bounds).any()):
        raise ValueError(f"{name} must lie inside the original image")
    if shape == (2, 2) and np.array_equal(points[0], points[1]):
        raise ValueError(f"{name} endpoints must be distinct")
    return points


def _image_bounds(geometry):
    dimensions = [geometry.get("image_width"), geometry.get("image_height")]
    if all(value is None for value in dimensions):
        return None
    if any(type(value) is not int or value <= 0 for value in dimensions):
        raise ValueError("image_width and image_height must both be positive integers")
    return _numeric_array(dimensions, (2,), "Image dimensions")


def global_sva_measurements_from_geometry(geometry: dict) -> dict:
    """Return normalized geometry, global SVA measurements, and availability QC.

    Required: region='full_spine' and explicit anterior_side='left' or 'right'.
    c7_centroid is one optional [x, y] point. s1_superior is an optional pair
    ordered [anterior, posterior]; its posterior endpoint is the S1 reference.
    Missing anchors remain absent; no centroid is inferred from other geometry.

    Source image_width/image_height, when supplied, must both be positive
    integers. Pixel-center coordinates satisfy 0 <= x < width and 0 <= y < height.
    Without dimensions, only nonnegative finite coordinates can be validated.
    pixel_spacing is optional [row_mm, column_mm]; only column spacing converts
    this horizontal displacement to millimetres. Additional geometry/provenance
    is copied without mutating the caller. Optional vertebral coordinate fields
    are validated but never used as substitutes for the two explicit anchors.
    """
    if not isinstance(geometry, dict) or geometry.get("region") != "full_spine":
        raise ValueError("Global SVA geometry requires region='full_spine'")
    side = geometry.get("anterior_side")
    if side not in ("left", "right"):
        raise ValueError("Global SVA requires anterior_side='left' or 'right'")
    if geometry.get("coordinate_space", "original_image") != "original_image":
        raise ValueError("Global SVA landmarks must use original_image coordinates")
    bounds = _image_bounds(geometry)
    centroid = _points(geometry.get("c7_centroid"), (2,), "C7 centroid", bounds)
    sacrum = _points(geometry.get("s1_superior"), (2, 2), "S1 superior", bounds)
    spacing = geometry.get("pixel_spacing")
    if spacing is not None:
        spacing = _numeric_array(spacing, (2,), "pixel_spacing")
        if (spacing <= 0).any():
            raise ValueError("pixel_spacing must contain positive [row_mm, column_mm] values")

    vertebrae = geometry.get("vertebrae", {})
    if not isinstance(vertebrae, dict):
        raise ValueError("vertebrae must be an object")
    normalized = copy.deepcopy(geometry)
    normalized.update(
        coordinate_space="original_image",
        c7_centroid=None if centroid is None else centroid.tolist(),
        s1_superior=None if sacrum is None else sacrum.tolist(),
        pixel_spacing=None if spacing is None else spacing.tolist(),
        spacing_source=None if spacing is None else geometry.get("spacing_source"),
        vertebrae={}, femoral_circles=[], hip_midpoint=None, l1_center=None,
    )
    for label, body in vertebrae.items():
        if not isinstance(label, str) or not label.strip() or not isinstance(body, dict):
            raise ValueError("Each vertebra must have a nonempty label and geometry object")
        normalized_body = copy.deepcopy(body)
        for key, shape in (("centroid", (2,)), ("superior", (2, 2)),
                           ("inferior", (2, 2)), ("quadrilateral", (4, 2))):
            if key in body:
                points = _points(body[key], shape, f"{label} {key}", bounds)
                normalized_body[key] = None if points is None else points.tolist()
        normalized["vertebrae"][label] = normalized_body

    measurements = {"region": "full_spine", "GLOBAL_SVA_PX": None, "GLOBAL_SVA_MM": None}
    if centroid is not None and sacrum is not None:
        direction = -1 if side == "left" else 1
        pixels = float(direction * (centroid[0] - sacrum[1, 0]))
        measurements["GLOBAL_SVA_PX"] = 0.0 if pixels == 0 else pixels
        if spacing is not None:
            millimetres = pixels * float(spacing[1])
            if not math.isfinite(millimetres):
                raise ValueError("Calibrated global SVA exceeds the finite numeric range")
            measurements["GLOBAL_SVA_MM"] = 0.0 if millimetres == 0 else millimetres

    anchors = {"C7 centroid": centroid, "S1 superior": sacrum}
    missing = [name for name, value in anchors.items() if value is None]
    reasons = [f"{name} is missing; global SVA is unavailable." for name in missing]
    if spacing is None:
        reasons.append("Image scale is unavailable; global SVA in millimetres is unavailable.")
    return {
        "geometry": normalized,
        "measurements": measurements,
        "qc": {
            "coverage": {"partial": bool(missing),
                         "available": [name for name, value in anchors.items() if value is not None],
                         "missing": missing, "unoriented": []},
            "global_sva": {"status": "incomplete" if missing else "uncalibrated" if spacing is None else "available",
                           "review_required": bool(reasons), "review_reasons": reasons,
                           "upper_reference": "C7 centroid", "lower_reference": "S1 posterosuperior corner",
                           "sva_sign": "positive_anterior", "horizontal_reference": "image_horizontal",
                           "vertical_reference": "image_vertical"},
        },
    }
