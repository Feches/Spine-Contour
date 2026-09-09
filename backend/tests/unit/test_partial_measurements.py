"""Partial anatomy keeps independent measurements; absence never becomes zero."""
import itertools

import cv2
import numpy as np
import pytest

from backend.utils import spinopelvic_measurements_from_geometry, spinopelvic_measurements_from_landmarks

LEVELS = ('L1', 'L2', 'L3', 'L4', 'L5')
NAMES = (*LEVELS, 'S1', 'femoral heads')


def body(top):
    return {'superior': [[20, top], [80, top]],
            'inferior': [[20, top + 10], [80, top + 10]],
            'quadrilateral': [[20, top], [80, top], [80, top + 10], [20, top + 10]]}


def anatomy(names):
    return ({level: body(10 + 20 * i) for i, level in enumerate(LEVELS) if level in names},
            [[20, 120], [80, 110]] if 'S1' in names else None,
            [[35, 145, 12], [65, 145, 12]] if 'femoral heads' in names else [])


@pytest.mark.parametrize('names', [combo for n in range(1, 8) for combo in itertools.combinations(NAMES, n)])
def test_every_nonempty_anatomy_subset_keeps_exactly_its_supported_measurements(names):
    complete = spinopelvic_measurements_from_geometry(*anatomy(NAMES))
    result = spinopelvic_measurements_from_geometry(*anatomy(names))
    measurements, geometry = result['measurements'], result['geometry']
    dependencies = {'SS': {'S1'}, 'PI': {'S1', 'femoral heads'}, 'PT': {'S1', 'femoral heads'},
                    'L1PA': {'L1', 'S1', 'femoral heads'}}
    for key, required in dependencies.items():
        expected = complete['measurements'][key] if required.issubset(names) else None
        assert measurements[key] == expected
    for level in LEVELS:
        key = f'{level}-S1'
        expected = complete['measurements']['LL'][key] if {level, 'S1'}.issubset(names) else None
        assert measurements['LL'][key] == expected
    assert set(geometry['vertebrae']) == set(names).intersection(LEVELS)
    assert (geometry['l1_center'] is not None) == ('L1' in names)
    assert (geometry['hip_midpoint'] is not None) == ('femoral heads' in names)
    assert result['qc']['coverage']['available'] == list(names)
    assert result['qc']['coverage']['partial'] == (len(names) != 7)
    assert result['qc']['coverage']['missing'] == [name for name in NAMES if name not in names]
    # Nulls and finite values only; actual JSON encoding must never need NaN.
    import json
    json.dumps(result, allow_nan=False)


def test_femoral_rejection_preserves_lumbar_and_sacral_geometry():
    mask = np.zeros((256, 256), dtype=np.uint8)
    cv2.rectangle(mask, (40, 120), (220, 175), 1, -1)
    vertebrae, s1, _ = anatomy(['L3', 'S1'])
    result = spinopelvic_measurements_from_landmarks(vertebrae, s1, mask)
    assert result['measurements']['LL']['L3-S1'] is not None
    assert result['measurements']['SS'] is not None
    assert result['measurements']['PI'] is None
    assert result['geometry']['femoral_circles'] == []
    assert result['qc']['femoral']['qc_pass'] is False
    assert 'circle_union_iou' in result['qc']['femoral']['reason']


def test_l1_without_s1_or_hips_returns_landmarks_and_null_angles():
    result = spinopelvic_measurements_from_landmarks({'L1': body(10)}, None, np.zeros((160, 100), np.uint8))
    assert set(result['geometry']['vertebrae']) == {'L1'}
    assert result['geometry']['l1_center'] == [50, 15]
    assert result['measurements'] == {'SS': None, 'PI': None, 'PT': None, 'L1PA': None,
                                     'LL': {f'{level}-S1': None for level in LEVELS}}


def test_an_image_with_no_usable_landmarks_is_still_rejected():
    with pytest.raises(ValueError, match='No usable'):
        spinopelvic_measurements_from_geometry({}, None, [])


@pytest.mark.parametrize('change', ['nan', 'collapsed', 'short', 'bad_s1', 'one_hip', 'negative_radius'])
def test_malformed_corrections_are_not_treated_as_missing_anatomy(change):
    vertebrae, s1, circles = anatomy(NAMES)
    if change == 'nan': vertebrae['L2']['superior'][0][0] = float('nan')
    if change == 'collapsed': vertebrae['L2']['superior'][1] = vertebrae['L2']['superior'][0]
    if change == 'short': vertebrae['L2']['inferior'] = [[1, 2]]
    if change == 'bad_s1': s1 = [[1, 2], [1, 2]]
    if change == 'one_hip': circles = circles[:1]
    if change == 'negative_radius': circles[0][2] = -1
    with pytest.raises(ValueError):
        spinopelvic_measurements_from_geometry(vertebrae, s1, circles)


def test_degenerate_angle_vectors_stay_null_but_real_zero_angles_are_kept():
    result = spinopelvic_measurements_from_geometry({'L1': body(10)}, [[20, 100], [80, 100]],
                                                   [[35, 100, 12], [65, 100, 12]])
    assert result['measurements']['SS'] == 0
    assert result['measurements']['LL']['L1-S1'] == 0
    assert result['measurements']['PI'] is None
    assert result['measurements']['PT'] is None
    assert result['measurements']['L1PA'] is None
