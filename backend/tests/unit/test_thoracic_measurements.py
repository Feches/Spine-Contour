"""Synthetic geometry only: no images or inference assets are read."""

import numpy as np
import pytest

from backend.thoracic_measurements import (
    t1_slope_degrees, t4_pelvic_angle_degrees, thoracic_measurements)
from backend.utils import spinopelvic_measurements_from_geometry


def test_t1_slope_is_the_acute_angle_to_the_image_horizontal():
    assert t1_slope_degrees([[0, 10], [20, 20]]) == pytest.approx(26.565051)
    assert t1_slope_degrees([[20, 20], [0, 10]]) == pytest.approx(26.565051)   # order-free
    assert t1_slope_degrees([[0, 10], [20, 0]]) == pytest.approx(26.565051)    # unsigned
    assert t1_slope_degrees([[0, 10], [20, 10]]) == 0.0
    assert t1_slope_degrees([[10, 0], [10, 20]]) == 90.0


def test_t1_slope_is_null_without_a_pair_or_with_a_degenerate_one_and_rejects_malformed():
    assert t1_slope_degrees(None) is None
    assert t1_slope_degrees([[5, 5], [5, 5]]) is None
    for bad in ([[np.nan, 1], [2, 2]], [[1, 2]], [[True, 1], [2, 2]], "x"):
        with pytest.raises(ValueError):
            t1_slope_degrees(bad)


def lumbar():
    body = {"superior": [[10, 10], [30, 12]], "inferior": [[10, 30], [30, 32]],
            "quadrilateral": [[10, 10], [30, 12], [30, 32], [10, 30]]}
    return spinopelvic_measurements_from_geometry(
        {"L1": body}, [[20, 80], [40, 90]], [[30, 95, 8], [34, 99, 8]])


def test_t4_pelvic_angle_equals_l1pa_for_the_same_point():
    result = lumbar()
    geometry = result["geometry"]
    assert result["measurements"]["L1PA"] is not None
    got = t4_pelvic_angle_degrees(geometry["l1_center"], geometry["hip_midpoint"], geometry["s1_superior"])
    assert got == pytest.approx(result["measurements"]["L1PA"])


def test_t4_pelvic_angle_null_cases_and_malformed():
    hip, s1 = [32, 97], [[20, 80], [40, 90]]
    assert t4_pelvic_angle_degrees(None, hip, s1) is None
    assert t4_pelvic_angle_degrees([10, 10], None, s1) is None
    assert t4_pelvic_angle_degrees([10, 10], hip, None) is None
    assert t4_pelvic_angle_degrees([32, 97], hip, s1) is None
    for bad in ([[1, 2]], [np.nan, 1], [True, 1]):
        with pytest.raises(ValueError):
            t4_pelvic_angle_degrees(bad, hip, s1)


def test_thoracic_measurements_reads_the_request_and_the_measured_geometry():
    request = {"t1_superior": [[0, 10], [20, 20]], "t4_centroid": [10, 10]}
    measured = {"hip_midpoint": [32, 97], "s1_superior": [[20, 80], [40, 90]]}
    result = thoracic_measurements(request, measured)
    assert result["measurements"]["T1S"] == pytest.approx(26.565051)
    assert result["measurements"]["T4PA"] is not None
    assert result["geometry"] == {"t1_superior": [[0.0, 10.0], [20.0, 20.0]], "t4_centroid": [10.0, 10.0]}
    result["geometry"]["t1_superior"][0][0] = 99
    assert request["t1_superior"] == [[0, 10], [20, 20]]
    empty = thoracic_measurements({}, {})
    assert empty == {"measurements": {"T1S": None, "T4PA": None},
                     "geometry": {"t1_superior": None, "t4_centroid": None}}
