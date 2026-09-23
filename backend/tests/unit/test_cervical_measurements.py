import copy
import math

import numpy as np
import pytest

from backend.cervical_measurements import cervical_measurements_from_geometry as measure


def geometry():
    return {
        "region": "cervical", "anterior_side": "left", "c2_centroid": [30, 10],
        "vertebrae": {
            "C2": {"superior": None, "inferior": [[20, 20], [40, 20]], "quadrilateral": None},
            "C7": {"superior": [[20, 50], [40, 50]], "inferior": [[20, 60], [40, 80]],
                   "quadrilateral": [[20, 50], [40, 50], [40, 80], [20, 60]]},
        },
    }


def test_cobb_uses_c2_and_c7_inferior_endplates_and_sva_uses_posterior_corner():
    source = geometry()
    original = copy.deepcopy(source)
    output = measure(source)
    assert source == original  # Corrections must never mutate caller-owned geometry.
    assert output["measurements"] == {
        "region": "cervical", "C2C7_COBB": 45, "C2C7_SVA_PX": 10, "C2C7_SVA_MM": None,
    }
    # Changing the C7 superior slope cannot change inferior-endplate Cobb.
    source["vertebrae"]["C7"]["superior"][0] = [40, 30]
    assert measure(source)["measurements"]["C2C7_COBB"] == 45


def test_mirrored_landmarks_preserve_anterior_positive_sva_and_cobb():
    left = geometry()
    right = copy.deepcopy(left)
    right["anterior_side"] = "right"
    right["c2_centroid"][0] = 100 - right["c2_centroid"][0]
    for body in right["vertebrae"].values():
        for points in body.values():
            for point in points or []:
                point[0] = 100 - point[0]
    assert measure(right)["measurements"] == measure(left)["measurements"]
    left["c2_centroid"][0] = 50
    assert measure(left)["measurements"]["C2C7_SVA_PX"] == -10


def test_anisotropic_spacing_changes_angle_and_uses_column_spacing_for_sva():
    source = {**geometry(), "pixel_spacing": [.5, .25], "spacing_source": "dicom_pixel_spacing",
              "source_sha256": "a" * 64, "coordinate_space": "original_image"}
    output = measure(source)
    assert output["measurements"]["C2C7_COBB"] == pytest.approx(math.degrees(math.atan2(2, 1)))
    assert output["measurements"]["C2C7_SVA_MM"] == 2.5
    assert output["geometry"]["pixel_spacing"] == [.5, .25]
    assert output["geometry"]["spacing_source"] == "dicom_pixel_spacing"
    assert output["geometry"]["source_sha256"] == "a" * 64
    assert output["qc"]["cervical"]["cobb_space"] == "physical"


@pytest.mark.parametrize("missing, expected_cobb, expected_sva", [
    ("c2_centroid", 45, None), ("C2 inferior", None, 10),
    ("C7 superior", 45, None), ("C7 inferior", None, 10),
])
def test_missing_anchor_invalidates_only_its_dependent_measure(missing, expected_cobb, expected_sva):
    source = geometry()
    if missing == "c2_centroid":
        source[missing] = None
    else:
        level, surface = missing.split()
        source["vertebrae"][level][surface] = None
    result = measure(source)
    assert result["measurements"]["C2C7_COBB"] == expected_cobb
    assert result["measurements"]["C2C7_SVA_PX"] == expected_sva
    assert result["measurements"]["C2C7_SVA_MM"] is None
    assert result["qc"]["coverage"]["partial"] is True


def test_empty_geometry_and_absent_scale_preserve_nulls_but_measured_zero_stays_zero():
    result = measure({"region": "cervical", "anterior_side": "left", "vertebrae": {}})
    assert all(result["measurements"][key] is None for key in ("C2C7_COBB", "C2C7_SVA_PX", "C2C7_SVA_MM"))
    assert result["geometry"]["c2_centroid"] is None
    assert result["geometry"]["s1_superior"] is None
    assert result["geometry"]["femoral_circles"] == []
    source = geometry()
    source["c2_centroid"][0] = 40
    source["pixel_spacing"] = [1, 1]
    assert measure(source)["measurements"]["C2C7_SVA_MM"] == 0
    source.update(pixel_spacing=None, spacing_source="stale_manual_reference")
    cleared = measure(source)
    assert cleared["measurements"]["C2C7_SVA_MM"] is None
    assert cleared["geometry"]["spacing_source"] is None


@pytest.mark.parametrize("value", [[np.nan, 1], [np.inf, 2], [-1, 2], [True, False], ["1", "2"], [1]])
def test_invalid_centroid_is_an_error_not_an_absent_measurement(value):
    with pytest.raises(ValueError, match="C2 centroid"):
        measure({**geometry(), "c2_centroid": value})


@pytest.mark.parametrize("value", [[0, 1], [-1, 1], [np.inf, 1], [1], [True, False], ["1", "2"]])
def test_invalid_spacing_is_rejected(value):
    with pytest.raises(ValueError, match="pixel_spacing"):
        measure({**geometry(), "pixel_spacing": value})


def test_degenerate_endplate_unknown_region_and_unconfirmed_orientation_are_rejected():
    source = geometry()
    source["vertebrae"]["C2"]["inferior"] = [[20, 20], [20, 20]]
    with pytest.raises(ValueError, match="distinct"):
        measure(source)
    with pytest.raises(ValueError, match="anterior_side"):
        measure({**geometry(), "anterior_side": None})
    with pytest.raises(ValueError, match="region"):
        measure({**geometry(), "region": "lumbar"})
    with pytest.raises(ValueError, match="original_image"):
        measure({**geometry(), "coordinate_space": "model_crop"})


@pytest.mark.parametrize("dimensions", [
    {"image_width": 80}, {"image_height": 100}, {"image_width": 0, "image_height": 100},
    {"image_width": 80.5, "image_height": 100}, {"image_width": True, "image_height": 100},
])
def test_malformed_source_dimensions_are_rejected(dimensions):
    with pytest.raises(ValueError, match="positive integers"):
        measure({**geometry(), **dimensions})


def test_all_landmarks_must_be_inside_source_dimensions_when_available():
    source = {**geometry(), "image_width": 80, "image_height": 100, "pixel_spacing": [1, 1]}
    assert measure(source)["measurements"]["C2C7_SVA_MM"] == 10
    source["c2_centroid"] = [80, 10]
    with pytest.raises(ValueError, match="inside the original image"):
        measure(source)
    source["c2_centroid"] = [30, 10]
    source["vertebrae"]["C7"]["inferior"][0] = [20, 100]
    with pytest.raises(ValueError, match="inside the original image"):
        measure(source)
