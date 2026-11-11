"""Synthetic geometry and runtime checks; no patient images or references."""
import subprocess
import sys
import threading

import numpy as np
import pytest

from backend import runtime
from backend.models import full_spine as full


@pytest.fixture(autouse=True)
def no_model_femoral_inference(monkeypatch):
    monkeypatch.setattr(full, '_femoral_region', lambda raw, pelvis:
                        (np.zeros(raw.shape, np.uint8), [], {'qc_pass': False}))


def candidate(x, y=300, score=.9, scale=20):
    return {"anchor": np.array([x, y], float), "scale": scale, "score": score}


def mirrored(points, width=500):
    p = np.asarray(points, float).copy()
    p[..., 0] = width-1-p[..., 0]
    return p


def test_lumbar_search_extends_every_candidate_upward_before_consensus():
    windows = full.lumbar_windows((100, 400, 300, 700), (1000, 500))
    assert len(windows) == 7
    for left, top, right, bottom in windows:
        assert bottom - top > 300 and top < 400


def test_lumbar_upward_extension_clips_at_image_top_without_moving_bottom():
    windows = full.lumbar_windows((100, 10, 300, 310), (1000, 500))
    assert min(top for _, top, _, _ in windows) == 0
    assert {bottom for *_, bottom in windows} >= {310}


def test_lumbar_crop_uses_buu_margins_around_the_detector_box():
    assert full.lumbar_window((100, 400, 200, 600), (1000, 500)) == (10, 349, 290, 700)
    assert full.lumbar_window((0, 0, 100, 900), (1000, 500)) == (0, 0, 500, 1000)


def test_cervical_crops_are_square_with_context_and_inside_the_film():
    windows = full.cervical_windows((100, 50, 200, 250), (1200, 400))
    assert 2 <= len(windows) <= 4
    for left, top, right, bottom in windows:
        assert right-left == bottom-top >= 260
        assert 0 <= left and right <= 400 and 0 <= top and bottom <= 1200


def test_consensus_selects_actual_medoid_not_high_scoring_outlier():
    values = [candidate(100, score=.2), candidate(105), candidate(110), candidate(300, score=1)]
    selected, qc = full.select_consensus(values)
    assert selected is values[1] and qc['support'] == 3


def test_unresolved_rival_cluster_is_withheld():
    values = [candidate(100), candidate(102), candidate(300), candidate(302)]
    selected, qc = full.select_consensus(values)
    assert selected is None and qc['status'] == 'ambiguous_clusters'


@pytest.mark.parametrize('values', [[], [candidate(100)], [candidate(100), candidate(300)]])
def test_absent_or_inconsistent_crops_do_not_manufacture_anchor(values):
    selected, qc = full.select_consensus(values)
    assert selected is None and qc['status'] != 'accepted'


def body_chain():
    return np.array([[[90, y], [110, y+1], [90, y+14], [110, y+15]]
                     for y in range(100, 250, 30)], float).reshape(-1, 2)


def test_body_geometry_rejects_collapse_reversal_and_repeated_levels():
    valid = body_chain()
    assert full._body_chain(valid) is not None
    collapsed = valid.copy(); collapsed[1] = collapsed[0]
    assert full._body_chain(collapsed) is None
    crossed = valid.copy(); crossed[[0, 1]] = crossed[[1, 0]]
    assert full._body_chain(crossed) is None
    repeated = valid.copy(); repeated[4:8] = repeated[:4]
    assert full._body_chain(repeated) is None


def test_body_geometry_accepts_either_facing_direction_without_relabelling():
    valid = body_chain()
    flipped = mirrored(valid)
    assert full._body_chain(flipped) == pytest.approx(full._body_chain(valid))
    assert full.anterior_delta(valid) < 0 < full.anterior_delta(flipped)
    # One body facing the other way is crossed, not a second orientation.
    mixed = valid.copy(); mixed[4:8] = mirrored(valid[4:8], 2*valid[4:8, 0].mean()+1)
    assert full._body_chain(mixed) is None


def test_native_image_coordinates_never_border_clipped():
    assert full._inside(np.array([[1, 2], [99, 79]]), (0, 0, 100, 80))
    assert not full._inside(np.array([[100, 79]]), (0, 0, 100, 80))
    assert not full._inside(np.array([[50, np.nan]]), (0, 0, 100, 80))


def test_runtime_import_does_not_load_training_libraries():
    subprocess.run([sys.executable, '-c', 'import sys; from backend.models import full_spine; '
                    'assert not {"torch", "torchvision", "timm", "transformers"} & sys.modules.keys()'], check=True)


def synthetic_regions(flip=False):
    neck, pelvis = [], []
    for dx in (-1, 0, 1):
        points = np.vstack(([[90, 70], [110, 70], [100, 60]], body_chain())) + [dx, 0]
        plate = np.array([[140+dx, 850], [180+dx, 845]], float)
        lumbar_points = np.vstack((body_chain()*2 + [dx, 350], plate))
        window = (10+dx, 20, 300+dx, 450)
        if flip:
            points, plate, lumbar_points = mirrored(points), mirrored(plate), mirrored(lumbar_points)
            window = (500-window[2], 20, 500-window[0], 450)
        neck.append({**candidate(points[19:23, 0].mean(), 227.5), 'points': points, 'window': window})
        pelvis.append({**candidate(plate[1, 0], 845, scale=40), 'endplate': plate,
                       'points': lumbar_points, 'window': (20, 600, 400, 990)})
    return neck, pelvis


REGIONS = {'cervical': (40, 40, 260, 430), 'lumbar': (60, 520, 380, 900)}


def patch_regions(monkeypatch, neck, pelvis, seen=None):
    def cervical(image, box):
        if seen is not None:
            seen.append(('cervical', image, box))
        return neck, {'windows': 3, 'detector_box': list(box) if box else None}
    def lumbar(image, box):
        if seen is not None:
            seen.append(('lumbar', image, box))
        return pelvis, {'windows': 7, 'detector_box': list(box) if box else None}
    monkeypatch.setattr(full, '_cervical_candidates', cervical)
    monkeypatch.setattr(full, '_lumbar_candidates', lumbar)


@pytest.mark.parametrize('flip, side', [(False, 'left'), (True, 'right')])
def test_models_run_once_on_the_unmirrored_film_and_label_the_side(monkeypatch, flip, side):
    neck, pelvis = synthetic_regions(flip)
    seen = []
    patch_regions(monkeypatch, neck, pelvis, seen)
    image = np.tile(np.arange(500, dtype=np.uint16), (1000, 1))
    result = full.full_spine_prediction(image, regions=REGIONS)
    # Each region model sees the original film, once, with the detector's box.
    assert [(name, box) for name, _, box in seen] == [('cervical', REGIONS['cervical']), ('lumbar', REGIONS['lumbar'])]
    for _, film, _ in seen:
        np.testing.assert_array_equal(film, image)
    g = result['landmarks']
    assert g['anterior_side'] == side and result['framing']['orientation']['status'] == 'landmarks'
    assert result['framing']['canonical_mirror'] is False
    assert set(g['vertebrae']) == {*(f'C{i}' for i in range(2, 8)), *(f'L{i}' for i in range(1, 6))}
    # Points are returned exactly as the models labelled them, anterior first.
    np.testing.assert_allclose(g['vertebrae']['L1']['superior'], pelvis[1]['points'][:2])
    np.testing.assert_allclose(g['s1_superior'], pelvis[1]['endplate'])
    np.testing.assert_allclose(g['c7_centroid'], neck[1]['anchor'])
    np.testing.assert_allclose(g['c2_centroid'], neck[1]['points'][2])
    assert result['framing']['cervical_window'] == list(neck[1]['window'])
    assert result['models']['lumbar'] == 'hrnet' and result['provenance']['s1_source'] == 'lumbar_hrnet'
    assert not result['mask'].any() and not result['femoral_mask'].any()


def test_detector_runs_when_regions_are_not_supplied(monkeypatch):
    neck, pelvis = synthetic_regions()
    patch_regions(monkeypatch, neck, pelvis)
    calls = []
    monkeypatch.setattr(full.learned_region, 'regions', lambda raw: calls.append(raw.shape) or REGIONS)
    full.full_spine_prediction(np.ones((1000, 500), np.uint8))
    assert calls == [(1000, 500)]


def test_missing_region_withholds_only_its_anchor(monkeypatch):
    neck, pelvis = synthetic_regions()
    patch_regions(monkeypatch, [], pelvis)
    result = full.full_spine_prediction(np.ones((1000, 500), np.uint8), regions={**REGIONS, 'cervical': None})
    g = result['landmarks']
    assert g['c7_centroid'] is None and g['s1_superior'] is not None and g['anterior_side'] == 'left'
    assert any('C7 centroid' in warning for warning in result['warnings'])


def test_no_landmarks_in_either_region_asks_for_a_choice(monkeypatch):
    patch_regions(monkeypatch, [], [])
    with pytest.raises(ValueError, match='No cervical or lumbar landmarks'):
        full.full_spine_prediction(np.ones((1000, 500), np.uint8), regions=REGIONS)


def test_reversed_regions_cannot_define_global_sva(monkeypatch):
    neck, pelvis = synthetic_regions()
    for value in neck:
        value['anchor'] = value['anchor'] + [0, 700]
    patch_regions(monkeypatch, neck, pelvis)
    result = full.full_spine_prediction(np.ones((1000, 500), np.uint8), regions=REGIONS)
    assert result['landmarks']['c7_centroid'] is None
    assert result['framing']['cervical']['status'] == 'incompatible_region_order'


def test_regions_facing_opposite_ways_use_lumbar_side_and_ask_for_review(monkeypatch):
    neck, _ = synthetic_regions(flip=True)
    _, pelvis = synthetic_regions(flip=False)
    patch_regions(monkeypatch, neck, pelvis)
    result = full.full_spine_prediction(np.ones((1000, 500), np.uint8), regions=REGIONS)
    assert result['landmarks']['anterior_side'] == 'left'
    assert result['framing']['orientation']['agree'] is False
    assert any('opposite directions' in warning for warning in result['warnings'])


def test_selected_side_only_relabels_and_flags_disagreement(monkeypatch):
    neck, pelvis = synthetic_regions()
    seen = []
    patch_regions(monkeypatch, neck, pelvis, seen)
    image = np.ones((1000, 500), np.uint8)
    result = full.full_spine_prediction(image, 'right', regions=REGIONS)
    assert result['landmarks']['anterior_side'] == 'right'
    assert result['framing']['orientation']['status'] == 'user_selected'
    assert any('disagrees with the anatomical landmarks' in warning for warning in result['warnings'])
    np.testing.assert_allclose(result['landmarks']['s1_superior'], pelvis[1]['endplate'])
    assert all(film is image for _, film, _ in seen)


@pytest.mark.parametrize('side', ['up', 'anterior', 0])
def test_invalid_anterior_rejected_before_models_run(monkeypatch, side):
    monkeypatch.setattr(full, '_cervical_candidates', lambda *a: pytest.fail('must not run'))
    with pytest.raises(ValueError, match='anterior image side'):
        full.full_spine_prediction(np.zeros((1000, 500), np.uint8), side, regions=REGIONS)


@pytest.mark.parametrize('side', ['', 'auto', None])
def test_blank_anterior_is_automatic(monkeypatch, side):
    neck, pelvis = synthetic_regions(flip=True)
    patch_regions(monkeypatch, neck, pelvis)
    result = full.full_spine_prediction(np.ones((1000, 500), np.uint8), side, regions=REGIONS)
    assert result['landmarks']['anterior_side'] == 'right'


def test_cancellation_before_models(monkeypatch):
    monkeypatch.setattr(full, '_cervical_candidates', lambda *a: pytest.fail('must not run'))
    cancelled = threading.Event()
    with runtime.session(runtime.Options(), None, cancelled):
        cancelled.set()
        with pytest.raises(runtime.Cancelled):
            full.full_spine_prediction(np.zeros((1000, 500), np.uint8), regions=REGIONS)


@pytest.mark.parametrize('circle', [[-5, 900, 30], [100, 900, 0], [np.nan, 900, 30]])
def test_invalid_optional_femoral_fit_preserves_spine_landmarks(monkeypatch, circle):
    neck, pelvis = synthetic_regions()
    patch_regions(monkeypatch, neck, pelvis)
    monkeypatch.setattr(full, '_femoral_region', lambda raw, pelvis:
                        (np.zeros(raw.shape, np.uint8), [circle], {'qc_pass': True}))
    result = full.full_spine_prediction(np.ones((1000, 500), np.uint8), regions=REGIONS)
    assert result['landmarks']['femoral_circles'] == []
    assert result['framing']['femoral']['qc_pass'] is False
    assert result['landmarks']['s1_superior'] is not None


def test_femoral_circles_stay_in_source_coordinates(monkeypatch):
    neck, pelvis = synthetic_regions(flip=True)
    patch_regions(monkeypatch, neck, pelvis)
    monkeypatch.setattr(full, '_femoral_region', lambda raw, pelvis:
                        (np.ones(raw.shape, np.uint8), [[120., 950., 30.]], {'qc_pass': True}))
    result = full.full_spine_prediction(np.ones((1000, 500), np.uint8), regions=REGIONS)
    assert result['landmarks']['femoral_circles'] == [[120., 950., 30.]]
    assert result['femoral_mask'].all()
