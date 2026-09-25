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
    assert result["measurements"]["region"] == "full_spine"
    assert result["measurements"]["GLOBAL_SVA_PX"] == 10
    assert result["measurements"]["GLOBAL_SVA_MM"] is None
    assert result["measurements"]["SS"] is not None
    assert result["measurements"]["C2C7_COBB"] is None
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
    for key in ('GLOBAL_SVA_PX', 'GLOBAL_SVA_MM'):
        assert measure(source)["measurements"][key] == expected[key]
    assert measure(source)["qc"]["global_sva"]["horizontal_reference"] == "image_horizontal"


def test_mirrored_images_keep_anterior_positive_and_posterior_negative_signs():
    source = geometry()
    mirrored = copy.deepcopy(source)
    mirrored["anterior_side"] = "right"
    mirrored["c7_centroid"][0] = 99 - mirrored["c7_centroid"][0]
    for point in mirrored["s1_superior"]:
        point[0] = 99 - point[0]
    assert measure(mirrored)["measurements"]["GLOBAL_SVA_PX"] == measure(source)["measurements"]["GLOBAL_SVA_PX"]
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
    assert measure(source)["measurements"]["GLOBAL_SVA_MM"] == result["measurements"]["GLOBAL_SVA_MM"]


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
    assert {'C7 centroid', 'S1 superior', 'C2 centroid', 'L1', 'femoral heads'}.issubset(
        result["qc"]["coverage"]["missing"])


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


def regional_geometry():
    def body(x, y):
        return {'superior': [[x, y], [x+20, y+2]],
                'inferior': [[x, y+8], [x+20, y+12]],
                'quadrilateral': [[x, y], [x+20, y+2], [x+20, y+12], [x, y+8]]}
    return {**geometry(), 'c2_centroid': [20, 5],
            'vertebrae': {'C2': {'superior': None, 'inferior': [[10, 10], [30, 10]],
                                  'quadrilateral': None},
                         'C7': body(20, 20), 'L1': body(20, 45), 'L5': body(20, 60)},
            'femoral_circles': [[20, 105, 5], [30, 105, 5]], 'pixel_spacing': [.5, .5]}


def test_standing_measurements_include_independent_cervical_and_lumbar_parameters():
    source = regional_geometry()
    before = copy.deepcopy(source)
    result = measure(source)
    values = result['measurements']
    assert values['C2C7_COBB'] == pytest.approx(math.degrees(math.atan(.2)))
    assert values['C2C7_SVA_PX'] == 20
    assert values['C2C7_SVA_MM'] == 10
    for key in ('GLOBAL_SVA_MM', 'SS', 'PI', 'PT', 'L1PA'):
        assert math.isfinite(values[key])
    assert values['LL']['L1-S1'] is not None and values['LL']['L5-S1'] is not None
    assert values['LL']['L2-S1'] is None
    assert result['geometry']['femoral_circles'] == source['femoral_circles']
    assert result['geometry']['hip_midpoint'] == [25, 105]
    assert result['geometry']['l1_center'] == [30, 50.5]
    assert result['geometry']['vertebrae'] == source['vertebrae']
    assert source == before


def test_missing_c7_preserves_lumbar_and_missing_hips_preserves_both_spines():
    source = regional_geometry()
    source['c7_centroid'] = None
    source['vertebrae'].pop('C7')
    values = measure(source)['measurements']
    assert values['GLOBAL_SVA_PX'] is None and values['C2C7_COBB'] is None
    assert values['C2C7_SVA_PX'] is None and values['LL']['L1-S1'] is not None
    source = regional_geometry()
    source['femoral_circles'] = []
    values = measure(source)['measurements']
    assert all(values[key] is None for key in ('PI', 'PT', 'L1PA'))
    assert all(values[key] is not None for key in ('GLOBAL_SVA_PX', 'C2C7_COBB', 'SS'))


def test_missing_sacrum_preserves_independent_cervical_measurements():
    source = regional_geometry()
    source['s1_superior'] = None
    values = measure(source)['measurements']
    assert all(values[key] is None for key in ('SS', 'PI', 'PT', 'L1PA', 'GLOBAL_SVA_PX'))
    assert all(value is None for value in values['LL'].values())
    assert values['C2C7_COBB'] is not None and values['C2C7_SVA_MM'] is not None


def test_empty_standing_anatomy_contains_only_null_measurements():
    values = measure({'region': 'full_spine', 'anterior_side': 'left'})['measurements']
    assert all(value is None for key, value in values.items() if key not in ('region', 'LL'))
    assert all(value is None for value in values['LL'].values())


def test_standing_regional_measurements_preserve_existing_regional_definitions():
    from backend.cervical_measurements import cervical_measurements_from_geometry
    from backend.utils import spinopelvic_measurements_from_geometry
    source = regional_geometry()
    source['pixel_spacing'] = [2, .5]
    result = measure(source)
    lumbar = spinopelvic_measurements_from_geometry(
        {level: body for level, body in source['vertebrae'].items() if level.startswith('L')},
        source['s1_superior'], source['femoral_circles'])
    cervical = cervical_measurements_from_geometry({**source, 'region': 'cervical',
        'vertebrae': {level: body for level, body in source['vertebrae'].items() if level.startswith('C')}})
    for key, value in lumbar['measurements'].items():
        assert result['measurements'][key] == value
    for key, value in cervical['measurements'].items():
        if key != 'region':
            assert result['measurements'][key] == value
    assert result['geometry']['vertebrae'] == source['vertebrae']
    assert result['qc']['lumbar']['angle_space'] == 'image'


def test_all_standing_measurements_are_mirror_invariant_with_anatomical_endpoint_order():
    source = regional_geometry()
    mirrored = copy.deepcopy(source)
    mirrored['anterior_side'] = 'right'
    def point(value):
        return [99-value[0], value[1]]
    for key in ('c2_centroid', 'c7_centroid'):
        mirrored[key] = point(mirrored[key])
    mirrored['s1_superior'] = [point(p) for p in mirrored['s1_superior']]
    for body in mirrored['vertebrae'].values():
        for key, value in body.items():
            if value is not None:
                body[key] = [point(p) for p in value]
    mirrored['femoral_circles'] = [[*point(c), c[2]] for c in mirrored['femoral_circles']]
    actual, expected = measure(mirrored)['measurements'], measure(source)['measurements']
    for key, value in expected.items():
        if isinstance(value, dict):
            assert actual[key] == pytest.approx(value)
        elif isinstance(value, (int, float)):
            assert actual[key] == pytest.approx(value)
        else:
            assert actual[key] == value


@pytest.mark.parametrize('patch', [
    {'c2_centroid': [100, 2]}, {'c2_centroid': [True, 2]},
    {'femoral_circles': [[1, 2, 0]]}, {'femoral_circles': [[100, 2, 3]]},
    {'femoral_circles': [[True, 2, 3]]}, {'l1_center': [1, 120]},
])
def test_regional_geometry_requires_finite_in_bounds_anatomical_points(patch):
    with pytest.raises(ValueError):
        measure({**regional_geometry(), **patch})
