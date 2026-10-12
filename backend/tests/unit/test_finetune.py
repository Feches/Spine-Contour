"""Numerical annotation contracts, not evidence of model accuracy."""
import numpy as np
import pytest
from backend.finetune.data import points_for, split_subjects, crop_window
from backend.finetune.worker import passes_gate, validate_config


def study():
    return {'id': 'SP-1000', 'subjectId': 'A', 'geometry': {
        'image_width': 500, 'image_height': 800, 'region': 'lumbar',
        'vertebrae': {f'L{i}': {'superior': [[100, i*100], [200, i*100]],
                               'inferior': [[100, i*100+50], [200, i*100+50]]} for i in range(1, 6)},
        's1_superior': [[100, 700], [200, 700]]}, 'qc': {'framing': {'window': [0, 0, 500, 800]}}}


def test_lumbar_target_order_and_missing_body_rejection():
    s = study()
    p = points_for(s, 'lumbar_landmarks')
    np.testing.assert_array_equal(p[12:16], [[100,400],[200,400],[100,450],[200,450]])
    assert points_for(s, 'lumbar_segmentation').shape == (20, 2)
    del s['geometry']['vertebrae']['L4']
    assert np.isnan(points_for(s, 'lumbar_landmarks')[12:16]).all()
    with pytest.raises(ValueError, match='all four corners'):
        points_for(s, 'lumbar_segmentation')


def test_polygon_rejects_crossed_corners_and_outside_points():
    s = study()
    s['geometry']['vertebrae']['L4']['inferior'].reverse()
    with pytest.raises(ValueError, match='non-crossing'):
        points_for(s, 'lumbar_segmentation')
    s = study()
    s['geometry']['vertebrae']['L4']['superior'][0][0] = 500
    with pytest.raises(ValueError, match='outside'):
        points_for(s, 'lumbar_landmarks')


def test_cervical_uses_image_sides_not_anatomical_order():
    s = study()
    s['geometry'].update(region='cervical', anterior_side='right', c2_centroid=[150,75],
                          vertebrae={'C2': {'inferior': [[200,100],[100,100]]}})
    p = points_for(s, 'cervical_landmarks')
    np.testing.assert_array_equal(p[:3], [[100,100],[200,100],[150,75]])
    assert np.isnan(p[3:]).all()


def test_split_keeps_every_film_of_a_subject_together_and_is_order_independent():
    rows = [{'id': str(i), 'subjectId': str(i//2)} for i in range(20)]
    splits = split_subjects(rows)
    assert splits == split_subjects(rows[::-1])
    for i in range(0, 20, 2):
        assert splits[str(i)] == splits[str(i+1)]
    assert set(splits.values()) == {'train', 'validation', 'test'}
    with pytest.raises(ValueError, match='five subjects'):
        split_subjects(rows[:8])


def test_cervical_crop_format_is_not_lumbar_format():
    s = study()
    s['qc']['framing']['window'] = [10,20,200,300]
    assert crop_window(s, 'lumbar_landmarks') == (10,20,200,300)
    assert crop_window(s, 'cervical_landmarks') == (10,20,210,320)
    s['geometry']['region'] = 'full_spine'
    s['qc']['framing']['cervical_window'] = [10,20,200,300]
    assert crop_window(s, 'cervical_landmarks') == (10,20,200,300)


def test_gate_rejects_subgroup_regression_even_when_average_improves():
    baseline = {'error': 3., 'per_label': {'0': 2., '1': 4.}}
    assert passes_gate(baseline, {'error': 2., 'per_label': {'0': 1., '1': 3.}})
    assert not passes_gate(baseline, {'error': 2., 'per_label': {'0': 2.1, '1': 1.9}})
    assert not passes_gate(baseline, {'error': float('nan'), 'per_label': {'0': 1., '1': 3.}})
    assert not passes_gate(baseline, {'error': 1., 'per_label': {'0': 1.}})


def test_config_rejects_unsafe_or_nonfinite_hyperparameters(tmp_path):
    checkpoint = tmp_path / 'model.pt'; checkpoint.write_bytes(b'checkpoint')
    valid = dict(target='lumbar_landmarks', epochs=1, batchSize=1, threads=2,
                 learningRate=1e-5, checkpoint=str(checkpoint))
    validate_config(valid)
    for field, value in [('epochs', 0), ('batchSize', True), ('threads', 100), ('learningRate', float('nan')), ('target', 'femoral')]:
        with pytest.raises(ValueError):
            validate_config({**valid, field: value})


def test_cuda_and_rocm_use_torch_gpu_indices_without_cpu_fallback(monkeypatch):
    from backend.finetune import worker
    monkeypatch.setattr(worker, 'devices', lambda: [{'id': 'cpu'}, {'id': 'cuda:1'}, {'id': 'rocm:0'}])
    assert worker.select_device('cpu') == 'cpu'
    assert worker.select_device('cuda:1') == 'cuda:1'
    assert worker.select_device('rocm:0') == 'cuda:0'
    with pytest.raises(ValueError, match='unavailable'):
        worker.select_device('cuda:0')
