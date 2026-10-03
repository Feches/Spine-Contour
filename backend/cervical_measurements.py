"""C2–C7 measurements from named landmarks in original-image coordinates.

The cervical HRNET network predicts image-left/right landmarks. Its caller must explicitly
map those to anterior/posterior before using this module; anatomical orientation
is never guessed from the shape of a radiograph.
"""

from __future__ import annotations

import copy
import math

import numpy as np


CERVICAL_LEVELS = ("C2", "C3", "C4", "C5", "C6", "C7")


def _points(value, shape, name, bounds=None):
    if value is None:
        return None
    points = np.asarray(value)
    if (points.shape != shape or not np.issubdtype(points.dtype, np.number)
            or not np.isfinite(points).all() or (points < 0).any()):
        raise ValueError(f"{name} must contain finite, nonnegative image coordinates")
    points = points.astype(np.float64)
    if shape == (2, 2) and np.array_equal(points[0], points[1]):
        raise ValueError(f"{name} endpoints must be distinct")
    if bounds is not None and (points >= bounds).any():
        raise ValueError(f"{name} coordinates must lie inside the original image")
    return points


def _spacing(value):
    if value is None:
        return None
    spacing = np.asarray(value)
    if (spacing.shape != (2,) or not np.issubdtype(spacing.dtype, np.number)
            or not np.isfinite(spacing).all() or (spacing <= 0).any()):
        raise ValueError("pixel_spacing must be [row_mm, column_mm] with finite positive values")
    return spacing.astype(np.float64)


def cervical_measurements_from_geometry(geometry: dict) -> dict:
    """Normalize partial cervical geometry and calculate independent measures.

    Cobb is the unsigned acute angle between C2 and C7 *inferior* endplates.
    SVA is the horizontal distance from the C2 centroid to the C7 posterosuperior
    corner, signed positive in the explicitly selected anterior direction.
    Pixel spacing is [row, column]; a missing scale retains pixel SVA and the
    image-space Cobb angle, but never invents an SVA value in millimetres.
    """
    if not isinstance(geometry, dict) or geometry.get("region") != "cervical":
        raise ValueError("Cervical geometry requires region='cervical'")
    anterior_side = geometry.get("anterior_side")
    if anterior_side not in ("left", "right"):
        raise ValueError("Cervical measurements require anterior_side='left' or 'right'")
    vertebrae = geometry.get("vertebrae", {})
    if not isinstance(vertebrae, dict) or any(level not in CERVICAL_LEVELS for level in vertebrae):
        raise ValueError("vertebrae must be an object containing detected C2-C7 levels")
    normalized = copy.deepcopy(geometry)
    normalized.update(vertebrae={}, s1_superior=None, femoral_circles=[], hip_midpoint=None,
                      l1_center=None, coordinate_space="original_image")
    if geometry.get("coordinate_space", "original_image") != "original_image":
        raise ValueError("Cervical landmarks must use original_image coordinates")
    dimensions = [geometry.get("image_width"), geometry.get("image_height")]
    bounds = None
    if any(value is not None for value in dimensions):
        if any(type(value) is not int or value <= 0 for value in dimensions):
            raise ValueError("image_width and image_height must both be positive integers")
        bounds = np.asarray(dimensions)
    spacing = _spacing(geometry.get("pixel_spacing"))
    normalized["pixel_spacing"] = None if spacing is None else spacing.tolist()
    normalized["spacing_source"] = geometry.get("spacing_source") if spacing is not None else None
    centroid = _points(geometry.get("c2_centroid"), (2,), "C2 centroid", bounds)
    normalized["c2_centroid"] = None if centroid is None else centroid.tolist()
    endplates = {}
    for level, body in vertebrae.items():
        if not isinstance(body, dict):
            raise ValueError(f"{level} geometry must be an object")
        normalized_body = copy.deepcopy(body)
        for name, shape in (("superior", (2, 2)), ("inferior", (2, 2)), ("quadrilateral", (4, 2))):
            points = _points(body.get(name), shape, f"{level} {name}", bounds)
            normalized_body[name] = None if points is None else points.tolist()
            if name != "quadrilateral":
                endplates[level, name] = points
        normalized["vertebrae"][level] = normalized_body

    measurements = {"region": "cervical", "C2C7_COBB": None,
                    "C2C7_SVA_PX": None, "C2C7_SVA_MM": None}
    c2_inferior = endplates.get(("C2", "inferior"))
    c7_inferior = endplates.get(("C7", "inferior"))
    c7_superior = endplates.get(("C7", "superior"))
    if c2_inferior is not None and c7_inferior is not None:
        # x is a column coordinate; y is a row coordinate.
        scale = np.ones(2) if spacing is None else spacing[::-1]
        first = (c2_inferior[1] - c2_inferior[0]) * scale
        second = (c7_inferior[1] - c7_inferior[0]) * scale
        # atan2 remains stable around parallel lines, unlike arccos(dot/norm).
        cross = abs(float(first[0] * second[1] - first[1] * second[0]))
        dot = abs(float(np.dot(first, second)))
        measurements["C2C7_COBB"] = math.degrees(math.atan2(cross, dot))
    if centroid is not None and c7_superior is not None:
        direction = -1 if anterior_side == "left" else 1
        pixels = float(direction * (centroid[0] - c7_superior[1, 0]))
        measurements["C2C7_SVA_PX"] = pixels
        if spacing is not None:
            measurements["C2C7_SVA_MM"] = pixels * float(spacing[1])

    anchors = {"C2 centroid": centroid, "C2 inferior": c2_inferior,
               "C7 superior": c7_superior, "C7 inferior": c7_inferior}
    missing = [name for name, value in anchors.items() if value is None]
    return {
        "geometry": normalized,
        "measurements": measurements,
        "qc": {"coverage": {"partial": bool(missing),
                             "available": [name for name, value in anchors.items() if value is not None],
                             "missing": missing, "unoriented": []},
               "cervical": {"cobb_endplates": ["C2 inferior", "C7 inferior"],
                            "cobb_space": "physical" if spacing is not None else "image",
                            "sva_reference": "C7 posterosuperior corner",
                            "sva_sign": "positive_anterior",
                            "vertical_reference": "image_vertical"}},
    }
