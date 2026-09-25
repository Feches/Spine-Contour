"""Synthetic geometry and runtime checks; no patient images or references."""
import subprocess
import sys
import threading

import numpy as np
import pytest

from backend import runtime
from backend.models import full_spine as full


def candidate(x, y=300, score=.9, scale=20):
    return {"anchor": np.array([x, y], float), "scale": scale, "score": score}


def test_overlapping_upper_windows_are_bounded_and_unique():
    windows = full.cervical_windows(2000, 700)
    assert len(windows) == len(set(windows)) and len(windows) > 6
    assert all(0 <= a < c <= 700 and 0 <= b < d <= 1100 for a, b, c, d in windows)
    assert len({d-b for a, b, c, d in windows}) == 3


def test_lumbar_translation_and_scale_windows_preserve_bounds():
    windows = full.lumbar_windows((20, 700, 420, 1300), (1400, 500))
    assert len(windows) == 7
    assert all(0 <= a < c <= 500 and 0 <= b < d <= 1400 for a, b, c, d in windows)
    assert (20, 700, 420, 1300) in windows


def test_consensus_selects_actual_medoid_not_high_scoring_outlier():
    values = [candidate(100), candidate(104), candidate(109), candidate(350, score=.999)]
    selected, qc = full.select_consensus(values)
    assert selected is values[1]
    assert qc['support'] == 3 and qc['spread_px'] == 5


def test_unresolved_rival_cluster_is_withheld():
    values = [candidate(100), candidate(104), candidate(109), candidate(350), candidate(351), candidate(355)]
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


def test_native_image_coordinates_never_border_clipped():
    assert full._inside(np.array([[1, 2], [99, 79]]), (0, 0, 100, 80))
    assert not full._inside(np.array([[100, 79]]), (0, 0, 100, 80))
    assert not full._inside(np.array([[50, np.nan]]), (0, 0, 100, 80))
    p = np.array([[3, 7], [90, 10]], float)
    np.testing.assert_array_equal(full._source_points(p, 100, True), [[96, 7], [9, 10]])
    np.testing.assert_array_equal(p, [[3, 7], [90, 10]])


def test_runtime_import_does_not_load_training_libraries():
    subprocess.run([sys.executable, '-c', 'import sys; from backend.models import full_spine; '
                    'assert not {"torch", "torchvision", "timm", "transformers"} & sys.modules.keys()'], check=True)


def synthetic_regions():
    neck = []
    pelvis = []
    for dx in (-1, 0, 1):
        points = np.vstack(([[90, 70], [110, 70], [100, 60]], body_chain())) + [dx, 0]
        neck.append({**candidate(100+dx, 227.5), 'points': points, 'window': (10, 20, 300, 450)})
        plate = np.array([[140+dx, 850], [180+dx, 845]], float)
        pelvis.append({**candidate(180+dx, 845, scale=40), 'endplate': plate,
                       'window': (20, 600, 400, 990)})
    return neck, pelvis


def test_full_pipeline_keeps_source_frame_and_separate_global_contract(monkeypatch):
    neck, pelvis = synthetic_regions()
    seen = []
    def cervical(image):
        seen.append(image.copy())
        return neck, {'windows': 3}
    monkeypatch.setattr(full, '_cervical_candidates', cervical)
    monkeypatch.setattr(full, '_lumbar_candidates', lambda image: (pelvis, {'windows': 3}))
    image = np.tile(np.arange(500, dtype=np.uint16), (1000, 1))
    left = full.full_spine_prediction(image, 'left')
    right = full.full_spine_prediction(image[:, ::-1], 'right')
    np.testing.assert_array_equal(seen[0], seen[1])
    g = left['landmarks']; mirror = right['landmarks']
    assert g['region'] == 'full_spine' and 'c2_centroid' not in g
    assert g['c7_centroid'] == [100, 227.5] and g['s1_superior'][1] == [180, 845]
    assert mirror['c7_centroid'] == [399, 227.5] and mirror['s1_superior'][1] == [319, 845]
    assert right['framing']['cervical_window'] == [200, 20, 490, 450]
    assert left['models']['lumbar'] == 'hrnet' and left['provenance']['s1_source'] == 'lumbar_hrnet'
    assert not left['mask'].any() and not left['femoral_mask'].any()
    assert left['warnings'] and left['image'].shape == image.shape


def test_missing_region_withholds_only_its_anchor(monkeypatch):
    neck, _ = synthetic_regions()
    monkeypatch.setattr(full, '_cervical_candidates', lambda image: (neck, {}))
    monkeypatch.setattr(full, '_lumbar_candidates', lambda image: ([], {}))
    result = full.full_spine_prediction(np.zeros((1000, 500), np.uint8), 'left')
    assert result['landmarks']['c7_centroid'] is not None
    assert result['landmarks']['s1_superior'] is None


def test_reversed_regions_cannot_define_global_sva(monkeypatch):
    neck, pelvis = synthetic_regions()
    for item in pelvis: item['anchor'][1] = 210
    monkeypatch.setattr(full, '_cervical_candidates', lambda image: (neck, {}))
    monkeypatch.setattr(full, '_lumbar_candidates', lambda image: (pelvis, {}))
    result = full.full_spine_prediction(np.zeros((1000, 500), np.uint8), 'left')
    assert result['landmarks']['c7_centroid'] is None and result['landmarks']['s1_superior'] is None
    assert result['framing']['lumbar']['status'] == 'incompatible_region_order'


@pytest.mark.parametrize('side', [None, 'auto', '', 'posterior'])
def test_explicit_anterior_required_before_models_run(monkeypatch, side):
    monkeypatch.setattr(full.models, '_infer', lambda *a: pytest.fail('must not infer'))
    with pytest.raises(ValueError, match='anterior'):
        full.full_spine_prediction(np.zeros((100, 100), np.uint8), side)


def test_cancellation_before_search(monkeypatch):
    stop = threading.Event()
    with runtime.session(cancelled=stop):
        stop.set()
        monkeypatch.setattr(full, '_cervical_candidates', lambda *a: pytest.fail('must not search'))
        with pytest.raises(runtime.Cancelled):
            full.full_spine_prediction(np.zeros((100, 100), np.uint8), 'left')


def test_duplicate_cervical_source_crops_cannot_inflate_support():
    from backend.models.cervical import CropTransform
    first = {"origin": [10, 20], "transform": CropTransform(5, 6, 105, 106), "score": .8}
    duplicate = {"origin": [0, 0], "transform": CropTransform(15, 26, 115, 126), "score": .9}
    distinct = {"origin": [0, 0], "transform": CropTransform(16, 26, 116, 126), "score": .7}
    selected = full.unique_cervical_crops([first, duplicate, distinct])
    assert len(selected) == 2
    assert selected[0]['score'] == .9 and selected[0]['source_crop'] == (15, 26, 115, 126)


def test_fractional_edge_point_cannot_become_negative_when_mirrored():
    assert full._inside(np.array([[99., 79.]]), (0, 0, 100, 80))
    assert not full._inside(np.array([[99.2, 79.]]), (0, 0, 100, 80))
    assert not full._inside(np.array([[99., 79.2]]), (0, 0, 100, 80))


def test_crossed_and_collapsed_body_edges_cannot_supply_centroid():
    points = body_chain()
    points[-4:] = [[90, 220], [110, 255], [90, 250], [110, 245]]
    assert full._body_chain(points) is None
    points = body_chain(); points[-2] = points[-4]
    assert full._body_chain(points) is None


def test_consensus_cannot_favor_inflated_predicted_body_width():
    values = [candidate(100, scale=30), candidate(104), candidate(109)]
    selected, _ = full.select_consensus(values)
    assert selected is values[1]
