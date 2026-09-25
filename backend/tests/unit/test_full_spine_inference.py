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
        neck.append({**candidate(100+dx, 227.5), 'points': points, 'window': (10+dx, 20, 300+dx, 450)})
        plate = np.array([[140+dx, 850], [180+dx, 845]], float)
        lumbar_points = np.vstack((body_chain()*2 + [dx, 350], plate))
        pelvis.append({**candidate(180+dx, 845, scale=40), 'endplate': plate,
                       'points': lumbar_points, 'window': (20, 600, 400, 990)})
    return neck, pelvis


def test_full_pipeline_keeps_source_frame_and_separate_global_contract(monkeypatch):
    neck, pelvis = synthetic_regions()
    seen = []
    def cervical(image):
        seen.append(image.copy())
        values = neck if image[0, 0] < image[0, -1] else [full._mirror_cervical_candidate(c, 500) for c in neck]
        return values, {'windows': 3}
    monkeypatch.setattr(full, '_cervical_candidates', cervical)
    monkeypatch.setattr(full, '_lumbar_candidates', lambda image: (pelvis, {'windows': 3}))
    image = np.tile(np.arange(500, dtype=np.uint16), (1000, 1))
    left = full.full_spine_prediction(image, 'left')
    right = full.full_spine_prediction(image[:, ::-1], 'right')
    np.testing.assert_array_equal(seen[0], seen[2])
    np.testing.assert_array_equal(seen[1], seen[3])
    g = left['landmarks']; mirror = right['landmarks']
    assert g['region'] == 'full_spine' and g['c2_centroid'] == [100, 60]
    assert set(g['vertebrae']) == {*(f'C{i}' for i in range(2, 8)), *(f'L{i}' for i in range(1, 6))}
    assert mirror['c2_centroid'] == [399, 60]
    assert mirror['vertebrae']['L1']['superior'] == [[319, 550], [279, 552]]
    assert g['c7_centroid'] == [100, 227.5] and g['s1_superior'][1] == [180, 845]
    assert mirror['c7_centroid'] == [399, 227.5] and mirror['s1_superior'][1] == [319, 845]
    assert right['framing']['cervical_window'] == [200, 20, 490, 450]
    assert left['models']['lumbar'] == 'hrnet' and left['provenance']['s1_source'] == 'lumbar_hrnet'
    assert not left['mask'].any() and not left['femoral_mask'].any()
    assert left['warnings'] and left['image'].shape == image.shape


def test_missing_region_withholds_only_its_anchor(monkeypatch):
    neck, _ = synthetic_regions()
    batches = iter((neck, [full._mirror_cervical_candidate(c, 500) for c in neck]))
    monkeypatch.setattr(full, '_cervical_candidates', lambda image: (next(batches), {}))
    monkeypatch.setattr(full, '_lumbar_candidates', lambda image: ([], {}))
    result = full.full_spine_prediction(np.zeros((1000, 500), np.uint8), 'left')
    assert result['landmarks']['c7_centroid'] is not None
    assert result['landmarks']['s1_superior'] is None


def test_reversed_regions_cannot_define_global_sva(monkeypatch):
    neck, pelvis = synthetic_regions()
    for item in pelvis: item['anchor'][1] = 210
    batches = iter((neck, [full._mirror_cervical_candidate(c, 500) for c in neck]))
    monkeypatch.setattr(full, '_cervical_candidates', lambda image: (next(batches), {}))
    monkeypatch.setattr(full, '_lumbar_candidates', lambda image: (pelvis, {}))
    result = full.full_spine_prediction(np.zeros((1000, 500), np.uint8), 'left')
    assert result['landmarks']['c7_centroid'] is None and result['landmarks']['s1_superior'] is not None
    assert result['framing']['cervical']['status'] == 'incompatible_region_order'


@pytest.mark.parametrize('side', ['posterior', 'LEFT'])
def test_invalid_anterior_rejected_before_models_run(monkeypatch, side):
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


def test_global_anchor_agreement_cannot_validate_disagreeing_regional_landmarks():
    neck, _ = synthetic_regions()
    neck[0]['points'][0, 1] += 60
    neck[2]['points'][0, 1] -= 60
    selected, qc = full.select_consensus(neck)
    assert selected is None
    assert qc['status'] == 'insufficient_agreement'


def orientation_evidence(side, regions):
    neck, pelvis = synthetic_regions()
    return {'anterior_side': side, 'neck': neck[1] if 'cervical' in regions else None,
            'pelvis': pelvis[1] if 'lumbar' in regions else None,
            'neck_qc': {'support': 3, 'status': 'accepted'},
            'pelvis_qc': {'support': 3, 'status': 'accepted'},
            'neck_search': {}, 'pelvis_search': {}}


@pytest.mark.parametrize('side', ['left', 'right'])
def test_automatic_orientation_reuses_both_hypotheses_and_preserves_source_pixels(monkeypatch, side):
    other = 'left' if side == 'right' else 'right'
    evidence = {side: orientation_evidence(side, ['cervical', 'lumbar']),
                other: orientation_evidence(other, [])}
    monkeypatch.setattr(full, 'search_orientation', lambda *args: pytest.fail('must reuse searches'))
    source = np.tile(np.arange(500, dtype=np.uint16), (1000, 1))
    result = full.full_spine_prediction(source, detection_evidence=evidence)
    assert result['landmarks']['anterior_side'] == side
    assert result['landmarks']['c7_centroid'] == [399 if side == 'right' else 100, 227.5]
    assert result['framing']['orientation']['status'] == 'accepted'
    assert result['provenance']['anterior_side_source'] == 'automatic'
    assert result['image'].shape == source.shape


@pytest.mark.parametrize('regions', [[], ['cervical'], ['cervical', 'lumbar']])
def test_automatic_orientation_withholds_ambiguous_hypotheses(regions):
    evidence = {side: orientation_evidence(side, regions) for side in ('left', 'right')}
    # More overlapping detections or detector confidence is not orientation proof.
    evidence['left']['neck_qc']['support'] = 12
    with pytest.raises(ValueError, match='orientation is uncertain'):
        full.full_spine_prediction(np.zeros((1000, 500), np.uint8), 'auto', detection_evidence=evidence)


@pytest.mark.parametrize('left_regions,right_regions', [
    (['cervical'], []), ([], ['cervical']),
    (['cervical', 'lumbar'], ['lumbar']), (['lumbar'], ['cervical', 'lumbar']),
])
def test_cervical_repeatability_cannot_independently_prove_anterior(left_regions, right_regions):
    selected, qc = full.select_orientation({
        'left': orientation_evidence('left', left_regions),
        'right': orientation_evidence('right', right_regions)})
    assert selected is None and qc['status'] == 'ambiguous'


def test_blank_anterior_is_automatic():
    evidence = {'left': orientation_evidence('left', ['cervical', 'lumbar']),
                'right': orientation_evidence('right', [])}
    result = full.full_spine_prediction(np.zeros((1000, 500), np.uint8), '', detection_evidence=evidence)
    assert result['landmarks']['anterior_side'] == 'left'
    assert result['provenance']['anterior_side_source'] == 'automatic'


def test_manual_orientation_overrides_automatic_evidence_without_search(monkeypatch):
    evidence = {side: orientation_evidence(side, ['cervical', 'lumbar']) for side in ('left', 'right')}
    monkeypatch.setattr(full, 'search_orientation', lambda *args: pytest.fail('must reuse selected side'))
    result = full.full_spine_prediction(np.zeros((1000, 500), np.uint8), 'right', detection_evidence=evidence)
    assert result['landmarks']['anterior_side'] == 'right'
    assert result['framing']['orientation']['status'] == 'user_selected'
    assert result['provenance']['anterior_side_source'] == 'user'


def test_femoral_circle_centres_and_mask_return_to_source_frame(monkeypatch):
    def femoral(raw, pelvis):
        mask = np.zeros(raw.shape, np.uint8)
        mask[920, 200] = 1
        return mask, [[200, 920, 20], [225, 925, 22]], {'qc_pass': True}
    monkeypatch.setattr(full, '_femoral_region', femoral)
    result = full.full_spine_prediction(np.zeros((1000, 500), np.uint8), 'right',
              detection_evidence={'right': orientation_evidence('right', ['cervical', 'lumbar'])})
    assert result['landmarks']['femoral_circles'] == [[299, 920, 20], [274, 925, 22]]
    assert result['femoral_mask'][920, 299] == 1
    assert result['femoral_mask'].sum() == 1


def neck_searches(left, right):
    return {'left': {**orientation_evidence('left', []), 'neck_candidates': left},
            'right': {**orientation_evidence('right', []), 'neck_candidates': right}}


def test_mirroring_cervical_points_preserves_image_sided_labels_and_is_involutive():
    neck, _ = synthetic_regions()
    source = neck[1]
    mirrored = full._mirror_cervical_candidate(source, 500)
    assert mirrored['points'][:3].tolist() == [[389, 70], [409, 70], [399, 60]]
    assert mirrored['points'][3:7].tolist() == [[389, 101], [409, 100], [389, 115], [409, 114]]
    restored = full._mirror_cervical_candidate(mirrored, 500)
    np.testing.assert_array_equal(restored['points'], source['points'])
    np.testing.assert_array_equal(restored['anchor'], source['anchor'])
    assert restored['window'] == source['window']


def test_shared_cervical_consensus_cannot_change_vertebral_identity_with_orientation():
    neck, _ = synthetic_regions()
    searches = neck_searches(neck[:2], [full._mirror_cervical_candidate(neck[2], 500)])
    result = full.reconcile_cervical_searches(np.zeros((1000, 500), np.uint8), searches)
    left, right = result['left'], result['right']
    assert left['neck_qc']['support'] == 3
    assert left['neck_qc']['orientation_support'] == ['left', 'right']
    source_right = full._mirror_cervical_candidate(right['neck'], 500)
    np.testing.assert_array_equal(source_right['points'], left['neck']['points'])


def test_cervical_chain_from_only_one_mirror_is_withheld():
    neck, _ = synthetic_regions()
    result = full.reconcile_cervical_searches(np.zeros((1000, 500), np.uint8), neck_searches(neck, []))
    assert all(value['neck'] is None for value in result.values())
    assert result['left']['neck_qc']['status'] == 'unconfirmed_across_mirrors'


def test_conflicting_same_crop_cannot_supply_false_cross_mirror_corroboration():
    neck, _ = synthetic_regions()
    conflict = full._mirror_cervical_candidate(neck[0], 500)
    conflict['points'][0, 1] += 100
    result = full.reconcile_cervical_searches(np.zeros((1000, 500), np.uint8),
                                             neck_searches(neck[:2], [conflict]))
    assert all(value['neck'] is None for value in result.values())
    assert result['left']['neck_qc']['conflicted_source_crops'] == 1
    assert result['left']['neck_qc']['support'] == 1


def test_duplicate_mirror_crop_cannot_inflate_spatial_support():
    neck, _ = synthetic_regions()
    result = full.reconcile_cervical_searches(np.zeros((1000, 500), np.uint8),
              neck_searches(neck[:1], [full._mirror_cervical_candidate(neck[0], 500)]))
    assert result['left']['neck'] is None
    assert result['left']['neck_qc']['candidates'] == 1


def test_explicit_orientation_still_checks_cervical_identity_in_opposite_mirror(monkeypatch):
    neck, _ = synthetic_regions()
    seen = []
    def opposite(raw):
        seen.append(raw)
        return [full._mirror_cervical_candidate(c, 500) for c in neck], {}
    monkeypatch.setattr(full, '_cervical_candidates', opposite)
    result = full.reconcile_cervical_searches(np.zeros((1000, 500), np.uint8),
              {'left': {**orientation_evidence('left', []), 'neck_candidates': neck}})
    assert len(seen) == 1 and result['left']['neck'] is not None


def test_reversed_anatomical_s1_labels_cannot_be_sorted_into_orientation_agreement(monkeypatch):
    from types import SimpleNamespace
    plate = np.array([[90, 270], [110, 270]], float)
    points = np.vstack((body_chain(), plate))
    window = (0, 0, 500, 1000)
    monkeypatch.setattr(full.framing, 'locate', lambda *args: {'window': window})
    monkeypatch.setattr(full, 'lumbar_windows', lambda *args: [window])
    monkeypatch.setattr(full.framing, 'prepare_crop', lambda *args:
                        (np.zeros((768, 768), np.uint8), SimpleNamespace(restore_points=lambda value: value)))
    class Session:
        def run(self, *args):
            return [points[None]]
    monkeypatch.setattr(full.models, '_infer', lambda kind, operation, message: operation(Session()))
    monkeypatch.setattr(full.models, '_score_s1', lambda images: [(.9, plate)])
    accepted, _ = full._lumbar_candidates(np.zeros((1000, 500), np.uint8))
    assert len(accepted) == 1
    monkeypatch.setattr(full.models, '_score_s1', lambda images: [(.9, plate[::-1])])
    rejected, _ = full._lumbar_candidates(np.zeros((1000, 500), np.uint8))
    assert rejected == []
