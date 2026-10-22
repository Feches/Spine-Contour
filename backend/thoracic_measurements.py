"""T1 slope and T4 pelvic angle from explicit landmarks in original-image coordinates.

T1S: the acute angle, 0-90 degrees and unsigned, between the T1 superior endplate
(a pair of image points, anterior then posterior; their order does not matter)
and the horizontal. It is the sacral-slope formula applied to the T1 pair.

T4PA: the angle at the femoral-head midpoint between the line to the T4 centroid
and the line to the midpoint of the S1 superior endplate, 0-180 degrees and
unsigned. It is the L1 pelvic angle formula with the T4 centroid in place of L1's.

The horizontal reference is the acquisition image's, as for SS and the global
SVA; no line is rotated to match any vertebra. Absent or degenerate input gives
None, never a guess: no T4 centroid, no hip midpoint (fewer than two femoral
circles), no S1 endplate, a T4 centroid on the hip midpoint, or two identical T1
points. A malformed value (wrong shape, non-finite, a boolean) is a ValueError.
No point is bounded by the image: a landmark may lie outside the film (the
2026-10-22 femoral-centre lesson, commit 5dc27eb), and a degenerate pair must
never fail the whole measurement.
"""

from __future__ import annotations

import math

import numpy as np

try:
    from .global_sva_measurements import _numeric_array
except ImportError:
    from global_sva_measurements import _numeric_array


def t1_slope_degrees(t1_superior):
    """Acute angle of the T1 superior endplate to the image horizontal, or None."""
    if t1_superior is None:
        return None
    pair = _numeric_array(t1_superior, (2, 2), "T1 superior endplate")
    if np.array_equal(pair[0], pair[1]):
        return None
    dx, dy = pair[1] - pair[0]
    degrees = abs(math.degrees(math.atan2(dy, dx)))
    return float(min(degrees, 180 - degrees))


def t4_pelvic_angle_degrees(t4_centroid, hip_midpoint, s1_superior):
    """Angle at the hip midpoint between the T4 centroid and the S1 midpoint, or None."""
    if t4_centroid is None:
        return None
    t4 = _numeric_array(t4_centroid, (2,), "T4 centroid")
    if hip_midpoint is None or s1_superior is None:
        return None
    hip = np.asarray(hip_midpoint, dtype=np.float64)
    s1_mid = np.asarray(s1_superior, dtype=np.float64).mean(axis=0)
    v1, v2 = t4 - hip, s1_mid - hip
    if not (np.linalg.norm(v1) > 0 and np.linalg.norm(v2) > 0):
        return None
    cross = v1[0] * v2[1] - v1[1] * v2[0]
    return float(math.degrees(math.atan2(abs(cross), float(np.dot(v1, v2)))))


def thoracic_measurements(request_geometry, measured_geometry):
    """Both angles, and the validated request points echoed as plain lists."""
    t1 = request_geometry.get("t1_superior")
    t4 = request_geometry.get("t4_centroid")
    t1_slope = t1_slope_degrees(t1)
    t4_angle = t4_pelvic_angle_degrees(
        t4, measured_geometry.get("hip_midpoint"), measured_geometry.get("s1_superior"))
    return {
        "measurements": {"T1S": t1_slope, "T4PA": t4_angle},
        "geometry": {
            "t1_superior": None if t1 is None else _numeric_array(t1, (2, 2), "T1 superior endplate").tolist(),
            "t4_centroid": None if t4 is None else _numeric_array(t4, (2,), "T4 centroid").tolist(),
        },
    }
