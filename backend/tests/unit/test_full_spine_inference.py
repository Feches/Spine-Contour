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
    """Fake region models that see real anatomy: a mirrored film gets mirrored points."""
    def answer(name, values, image, box):
        if seen is not None:
            seen.append((name, image, box))
        flipped = image[0, 0] > image[0, -1]
        width = image.shape[1]
        return ([full._mirror_candidate(value, width) for value in values] if flipped else values,
                {'windows': 3, 'detector_box': list(box) if box else None})
    monkeypatch.setattr(full, '_cervical_candidates', lambda image, box: answer('cervical', neck, image, box))
    monkeypatch.setattr(full, '_lumbar_candidates', lambda image, box: answer('lumbar', pelvis, image, box))
    # The fallback searches find nothing unless a test says otherwise.
    monkeypatch.setattr(full, '_searched_cervical_candidates', lambda image: ([], {'windows': 0}))
    monkeypatch.setattr(full.framing, 'locate', lambda image, score: None)


FILM = np.tile(np.arange(500, dtype=np.uint16), (1000, 1))


@pytest.mark.parametrize('flip, side', [(False, 'left'), (True, 'right')])
def test_side_comes_from_the_landmarks_and_right_facing_films_are_read_left_facing(monkeypatch, flip, side):
    neck, pelvis = synthetic_regions(flip)
    seen = []
    patch_regions(monkeypatch, neck, pelvis, seen)
    result = full.full_spine_prediction(FILM, regions=REGIONS)
    # First read: the original film, once per region, with the detector's boxes.
    assert [(name, box) for name, _, box in seen[:2]] == [('cervical', REGIONS['cervical']), ('lumbar', REGIONS['lumbar'])]
    for _, film, _ in seen[:2]:
        np.testing.assert_array_equal(film, FILM)
    if flip:
        # A right-facing film is read once more, mirrored, with mirrored boxes.
        assert [(name, box) for name, _, box in seen[2:]] == [
            ('cervical', full._mirror_box(REGIONS['cervical'], 500)), ('lumbar', full._mirror_box(REGIONS['lumbar'], 500))]
        for _, film, _ in seen[2:]:
            np.testing.assert_array_equal(film, FILM[:, ::-1])
    else:
        assert len(seen) == 2
    g = result['landmarks']
    assert g['anterior_side'] == side and result['framing']['orientation']['status'] == 'landmarks'
    assert result['framing']['canonical_mirror'] is flip
    assert set(g['vertebrae']) == {*(f'C{i}' for i in range(2, 8)), *(f'L{i}' for i in range(1, 6))}
    # Returned in original film pixels, anterior first, whichever frame was read.
    np.testing.assert_allclose(g['vertebrae']['L1']['superior'], pelvis[1]['points'][:2])
    np.testing.assert_allclose(g['s1_superior'], pelvis[1]['endplate'])
    np.testing.assert_allclose(g['c7_centroid'], neck[1]['anchor'])
    np.testing.assert_allclose(g['c2_centroid'], neck[1]['points'][2])
    assert result['framing']['cervical_window'] == list(neck[1]['window'])
    assert result['models']['lumbar'] == 'hrnet' and result['provenance']['s1_source'] == 'lumbar_hrnet'
    assert not result['mask'].any() and not result['femoral_mask'].any()


def test_mirror_helpers_are_involutive_and_keep_labels():
    neck, _ = synthetic_regions()
    back = full._mirror_candidate(full._mirror_candidate(neck[0], 500), 500)
    np.testing.assert_allclose(back['points'], neck[0]['points'])
    assert tuple(back['window']) == tuple(neck[0]['window'])
    assert full.anterior_delta(full._mirror_candidate(neck[0], 500)['points'][3:]) > 0


def test_nothing_agreeing_in_the_mirrored_frame_keeps_the_original_read(monkeypatch):
    neck, pelvis = synthetic_regions(flip=True)
    calls = []
    def cervical(image, box):
        calls.append(image[0, 0] > image[0, -1])
        return ([] if calls[-1] else neck), {}
    def lumbar(image, box):
        return ([] if image[0, 0] > image[0, -1] else pelvis), {}
    monkeypatch.setattr(full, '_cervical_candidates', cervical)
    monkeypatch.setattr(full, '_lumbar_candidates', lumbar)
    monkeypatch.setattr(full, '_searched_cervical_candidates', lambda image: ([], {}))
    monkeypatch.setattr(full.framing, 'locate', lambda image, score: None)
    result = full.full_spine_prediction(FILM, regions=REGIONS)
    assert calls == [False, True]
    assert result['framing']['canonical_mirror'] is False and result['landmarks']['anterior_side'] == 'right'
    np.testing.assert_allclose(result['landmarks']['s1_superior'], pelvis[1]['endplate'])


def test_detector_runs_when_regions_are_not_supplied(monkeypatch):
    neck, pelvis = synthetic_regions()
    patch_regions(monkeypatch, neck, pelvis)
    calls = []
    monkeypatch.setattr(full.learned_region, 'regions',
                        lambda raw, **kw: calls.append((raw.shape, kw)) or REGIONS)
    full.full_spine_prediction(np.ones((1000, 500), np.uint8))
    # A chosen full-spine film skips Auto's presence gate: both regions are asserted.
    assert calls == [((1000, 500), {'present_score': 0})]


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


def test_selected_side_chooses_the_frame_without_a_first_read(monkeypatch):
    neck, pelvis = synthetic_regions()
    seen = []
    patch_regions(monkeypatch, neck, pelvis, seen)
    result = full.full_spine_prediction(FILM, 'right', regions=REGIONS)
    assert len(seen) == 2 and all(film[0, 0] > film[0, -1] for _, film, _ in seen)
    assert result['landmarks']['anterior_side'] == 'right'
    assert result['framing']['orientation']['status'] == 'user_selected'
    assert any('disagrees with the anatomical landmarks' in warning for warning in result['warnings'])
    np.testing.assert_allclose(result['landmarks']['s1_superior'], pelvis[1]['endplate'])


@pytest.mark.parametrize('side', ['up', 'anterior', 0])
def test_invalid_anterior_rejected_before_models_run(monkeypatch, side):
    monkeypatch.setattr(full, '_cervical_candidates', lambda *a: pytest.fail('must not run'))
    with pytest.raises(ValueError, match='anterior image side'):
        full.full_spine_prediction(np.zeros((1000, 500), np.uint8), side, regions=REGIONS)


@pytest.mark.parametrize('side', ['', 'auto', None])
def test_blank_anterior_is_automatic(monkeypatch, side):
    neck, pelvis = synthetic_regions(flip=True)
    patch_regions(monkeypatch, neck, pelvis)
    result = full.full_spine_prediction(FILM, side, regions=REGIONS)
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


def test_femoral_heads_from_the_mirrored_frame_return_to_source_coordinates(monkeypatch):
    neck, pelvis = synthetic_regions(flip=True)
    patch_regions(monkeypatch, neck, pelvis)
    def femoral(image, pelvis):
        assert image[0, 0] > image[0, -1]
        mask = np.zeros(image.shape, np.uint8); mask[:, :10] = 1
        return mask, [[120., 950., 30.]], {'qc_pass': True, 'crop_window': [100, 800, 200, 990]}
    monkeypatch.setattr(full, '_femoral_region', femoral)
    result = full.full_spine_prediction(FILM, regions=REGIONS)
    assert result['landmarks']['femoral_circles'] == [[379., 950., 30.]]
    assert result['femoral_mask'][:, -10:].all() and not result['femoral_mask'][:, :-10].any()
    assert result['framing']['femoral']['crop_window'] == [300, 800, 400, 990]


def test_femoral_crop_is_framed_from_s1_not_the_detector_window():
    pelvis = {'endplate': np.array([[200., 600.], [240., 590.]]), 'window': (0, 0, 500, 1000)}
    framed = full._femoral_frame(pelvis, (2000, 1000))
    left, top, right, bottom = framed['window']
    length = np.hypot(40, 10)
    assert bottom - top == pytest.approx(full.FEMORAL_FRAME['height'] * length, abs=2)
    assert right - left == pytest.approx(full.FEMORAL_FRAME['width'] * length, abs=2)
    # S1 sits in the upper two-thirds, leaving room below for the heads.
    assert (595 - top) / (bottom - top) == pytest.approx(full.FEMORAL_FRAME['y'], abs=.01)
    assert left < 220 < right
    assert full._femoral_frame(None, (2000, 1000)) is None


def test_a_neck_the_detector_misses_is_found_by_the_upper_film_search(monkeypatch):
    neck, pelvis = synthetic_regions()
    patch_regions(monkeypatch, [], pelvis)
    searched = []
    monkeypatch.setattr(full, '_searched_cervical_candidates', lambda image: searched.append(image.shape) or (neck, {'windows': 9}))
    result = full.full_spine_prediction(FILM, regions={**REGIONS, 'cervical': None})
    assert searched == [FILM.shape]
    np.testing.assert_allclose(result['landmarks']['c7_centroid'], neck[1]['anchor'])
    assert result['framing']['cervical']['source'] == 'upper_film_search'
    assert result['framing']['cervical']['fallback_search'] == {'windows': 9}


def test_the_upper_film_search_runs_only_when_the_detector_neck_fails(monkeypatch):
    neck, pelvis = synthetic_regions()
    patch_regions(monkeypatch, neck, pelvis)
    monkeypatch.setattr(full, '_searched_cervical_candidates', lambda image: pytest.fail('searched a read neck'))
    monkeypatch.setattr(full.framing, 'locate', lambda image, score: pytest.fail('searched a read pelvis'))
    full.full_spine_prediction(FILM, regions=REGIONS)


def test_a_lumbar_region_the_detector_misses_is_framed_by_the_s1_localizer(monkeypatch):
    neck, pelvis = synthetic_regions()
    patch_regions(monkeypatch, neck, [])
    framed = []
    monkeypatch.setattr(full.framing, 'locate', lambda image, score: {'window': [20, 600, 400, 990]})
    monkeypatch.setattr(full, '_framed_lumbar_candidates',
                        lambda image, window, record: framed.append((window, record)) or (pelvis, {'windows': 7, **record}))
    result = full.full_spine_prediction(FILM, regions={**REGIONS, 'lumbar': None})
    assert framed == [((20, 600, 400, 990), {'detector_box': None, 'source': 's1_localizer'})]
    np.testing.assert_allclose(result['landmarks']['s1_superior'], pelvis[1]['endplate'])
    assert result['framing']['lumbar']['source'] == 's1_localizer_search'
