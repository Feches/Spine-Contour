"""Synthetic geometry only: no images or inference assets are read."""

import copy
import math

import numpy as np
import pytest

from backend.global_sva_measurements import global_sva_measurements_from_geometry as measure


def geometry():
    return {
        "region": "full_spine", "anterior_side": "left", "coordinate_space": "original_image",
        "c7_centroid": [30, 10], "s1_superior": [[20, 80], [40, 90]],
        "image_width": 100, "image_height": 120,
    }


def test_global_sva_uses_c7_centroid_and_s1_posterosuperior_corner():
    source = geometry()
    before = copy.deepcopy(source)
    result = measure(source)
    assert result["measurements"] == {"region": "full_spine", "GLOBAL_SVA_PX": 10, "GLOBAL_SVA_MM": None}
    assert source == before
    assert result["geometry"] is not source
    result["geometry"]["s1_superior"][0][0] = 99
    assert source == before
    assert result["qc"]["global_sva"]["status"] == "uncalibrated"
    assert result["qc"]["global_sva"]["lower_reference"] == "S1 posterosuperior corner"


def test_acquisition_horizontal_is_independent_of_sacral_slope_and_vertical_separation():
    source = geometry()
    expected = measure(source)["measurements"]
    source["s1_superior"][0] = [2, 115]
    source["s1_superior"][1][1] = 110
    source["c7_centroid"][1] = 60
    assert measure(source)["measurements"] == expected
    assert measure(source)["qc"]["global_sva"]["horizontal_reference"] == "image_horizontal"


def test_mirrored_images_keep_anterior_positive_and_posterior_negative_signs():
    source = geometry()
    mirrored = copy.deepcopy(source)
    mirrored["anterior_side"] = "right"
    mirrored["c7_centroid"][0] = 99 - mirrored["c7_centroid"][0]
    for point in mirrored["s1_superior"]:
        point[0] = 99 - point[0]
    assert measure(mirrored)["measurements"] == measure(source)["measurements"]
    source["c7_centroid"][0] = 50
    assert measure(source)["measurements"]["GLOBAL_SVA_PX"] == -10
    mirrored["c7_centroid"][0] = 49
    assert measure(mirrored)["measurements"]["GLOBAL_SVA_PX"] == -10


def test_anisotropic_scale_uses_column_spacing_and_preserves_provenance():
    source = {**geometry(), "pixel_spacing": [3.0, .25], "spacing_source": "dicom_pixel_spacing",
              "source_sha256": "a" * 64}
    result = measure(source)
    assert result["measurements"]["GLOBAL_SVA_PX"] == 10
    assert result["measurements"]["GLOBAL_SVA_MM"] == 2.5
    assert result["geometry"]["pixel_spacing"] == [3, .25]
    assert result["geometry"]["spacing_source"] == "dicom_pixel_spacing"
    assert result["geometry"]["source_sha256"] == "a" * 64
    assert result["qc"]["global_sva"]["status"] == "available"
    source["pixel_spacing"][0] = .001
    assert measure(source)["measurements"] == result["measurements"]


def test_real_zero_is_retained_and_cleared_scale_does_not_restore_old_millimetres():
    source = {**geometry(), "pixel_spacing": [.5, .25], "spacing_source": "manual_reference"}
    source["c7_centroid"][0] = source["s1_superior"][1][0]
    result = measure(source)
    assert result["measurements"]["GLOBAL_SVA_PX"] == 0
    assert result["measurements"]["GLOBAL_SVA_MM"] == 0
    assert math.copysign(1, result["measurements"]["GLOBAL_SVA_PX"]) == 1
    source["pixel_spacing"] = None
    result = measure(source)
    assert result["measurements"]["GLOBAL_SVA_PX"] == 0
    assert result["measurements"]["GLOBAL_SVA_MM"] is None
    assert result["geometry"]["spacing_source"] is None


@pytest.mark.parametrize("missing", ["c7_centroid", "s1_superior", "both"])
def test_missing_anchors_return_null_measurements_and_explicit_review(missing):
    source = {**geometry(), "pixel_spacing": [1, 1]}
    for name in ("c7_centroid", "s1_superior"):
        if missing == name or missing == "both":
            source.pop(name)
    result = measure(source)
    assert result["measurements"]["GLOBAL_SVA_PX"] is None
    assert result["measurements"]["GLOBAL_SVA_MM"] is None
    assert result["qc"]["coverage"]["partial"] is True
    assert result["qc"]["global_sva"]["status"] == "incomplete"
    assert result["qc"]["global_sva"]["review_required"] is True
    assert result["qc"]["global_sva"]["review_reasons"]


def test_optional_body_geometry_is_retained_but_never_substitutes_for_explicit_anchors():
    body = {"centroid": [30, 10], "superior": [[20, 5], [40, 5]],
            "inferior": [[20, 15], [40, 15]], "quadrilateral": [[20, 5], [40, 5], [40, 15], [20, 15]],
            "annotation": "synthetic"}
    source = {**geometry(), "c7_centroid": None, "vertebrae": {"C7": body}}
    result = measure(source)
    assert result["geometry"]["vertebrae"] == source["vertebrae"]
    assert result["geometry"]["vertebrae"]["C7"] is not body
    assert result["measurements"]["GLOBAL_SVA_PX"] is None


@pytest.mark.parametrize("point", [[np.nan, 1], [1, np.inf], ["30", 10], [True, 10],
                                   [30, False], [-1, 10], [100, 10], [30, 120], [30], [[30, 10]]])
def test_malformed_or_out_of_bounds_c7_centroid_is_rejected(point):
    with pytest.raises(ValueError, match="C7 centroid"):
        measure({**geometry(), "c7_centroid": point})


@pytest.mark.parametrize("points", [[[40, 90], [40, 90]], [[20, 80], [40, np.nan]],
                                    [[20, 80], [100, 90]], [[20, 120], [40, 90]],
                                    [[True, 80], [40, 90]], [[20, 80]]])
def test_s1_endplate_requires_two_distinct_finite_in_bounds_points(points):
    with pytest.raises(ValueError, match="S1 superior"):
        measure({**geometry(), "s1_superior": points})


@pytest.mark.parametrize("spacing", [[0, 1], [1, -1], [np.inf, 1], [1, np.nan],
                                    [True, 1], [1, False], ["1", 1], [1]])
def test_invalid_scale_cannot_produce_millimetres(spacing):
    with pytest.raises(ValueError, match="pixel_spacing"):
        measure({**geometry(), "pixel_spacing": spacing})


@pytest.mark.parametrize("patch", [{"image_width": None}, {"image_height": None}, {"image_width": 0},
                                  {"image_height": -1}, {"image_width": 100.5}, {"image_height": True}])
def test_partial_or_invalid_dimensions_are_rejected(patch):
    with pytest.raises(ValueError, match="positive integers"):
        measure({**geometry(), **patch})


def test_optional_dimensions_and_minimal_empty_geometry_are_supported():
    result = measure({"region": "full_spine", "anterior_side": "right"})
    assert result["geometry"]["c7_centroid"] is None
    assert result["geometry"]["s1_superior"] is None
    assert result["geometry"]["vertebrae"] == {}
    assert result["geometry"]["femoral_circles"] == []
    assert result["geometry"]["hip_midpoint"] is None
    assert result["geometry"]["l1_center"] is None
    assert result["measurements"]["GLOBAL_SVA_PX"] is None
    assert len(result["qc"]["coverage"]["missing"]) == 2


@pytest.mark.parametrize("patch", [{"region": "cervical"}, {"anterior_side": None},
                                  {"anterior_side": "unknown"}, {"coordinate_space": "model_crop"}])
def test_region_orientation_and_coordinate_frame_must_be_explicitly_compatible(patch):
    with pytest.raises(ValueError):
        measure({**geometry(), **patch})


@pytest.mark.parametrize("bodies", [[], {"": {}}, {"C7": []}, {"C7": {"centroid": [100, 1]}},
                                   {"C7": {"superior": [[1, 1], [1, 1]]}}])
def test_optional_vertebral_geometry_is_validated(bodies):
    with pytest.raises(ValueError):
        measure({**geometry(), "vertebrae": bodies})


def test_finite_inputs_cannot_return_nonfinite_physical_measurement():
    with pytest.raises(ValueError, match="finite numeric range"):
        measure({**geometry(), "pixel_spacing": [1, 1e308]})
