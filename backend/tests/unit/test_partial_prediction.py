"""Exercise the real crop/landmark pipeline with controlled model outputs."""
import cv2
import numpy as np
import pytest

from backend import framing
from backend.models import models
from backend.models.hrnet import LANDMARKS


def frame(levels, s1=None):
    labels = np.zeros((768, 768), np.uint8)
    points = np.zeros((len(LANDMARKS), 2))
    for i in range(1, 6):
        top = 60 + i * 90
        quad = {'SA': [200, top], 'SP': [400, top], 'IA': [200, top + 50], 'IP': [400, top + 50]}
        if f'L{i}' in levels:
            cv2.rectangle(labels, (200, top), (400, top + 50), i, -1)
        for slot, (level, corner) in enumerate(LANDMARKS):
            if level == f'L{i}': points[slot] = quad[corner]
    return {'vertebra_labels': labels, 'hrnet_points': points, 's1': s1,
            's1_confidence': .95 if s1 is not None else 0., 'femoral': np.zeros_like(labels)}


@pytest.mark.parametrize('model', ['unet', 'hrnet'])
@pytest.mark.parametrize('levels', [['L1'], ['L3'], ['L2', 'L4'], ['L1', 'L2', 'L3', 'L4', 'L5']])
def test_no_s1_search_anchor_still_runs_whole_film_without_inventing_or_renumbering_levels(monkeypatch, model, levels):
    monkeypatch.setattr(framing, 'locate', lambda *args: None)
    monkeypatch.setattr(models, '_read_frame', lambda *args: frame(levels))
    prediction = models.spinopelvic_prediction(np.zeros((768, 768), np.uint8), models={'vertebrae': model})
    assert set(prediction['landmarks']['vertebrae']) == set(levels)
    assert set(np.unique(prediction['mask'])) == {0, *(19 + int(level[1]) for level in levels)}
    assert prediction['landmarks']['S1']['superior'] is None
    assert prediction['framing']['window'] == [0, 0, 768, 768]
    assert prediction['framing']['fallback_whole_film'] is True
    for body in prediction['landmarks']['vertebrae'].values():
        if model == 'unet': assert body['anterior_confirmed'] is False


def test_failed_s1_redetection_restores_whole_film_instead_of_discarding_l1(monkeypatch):
    located = {'window': (100, 100, 600, 600), 'searched': True, 'whole_film_won': False,
               'whole_film_cost': 1., 'confidence': .95, 'cost': 1., 'candidates': 8}
    monkeypatch.setattr(framing, 'locate', lambda *args: located)
    calls = []
    def read(canvas, choice):
        calls.append(canvas.shape)
        return frame(['L1'])
    monkeypatch.setattr(models, '_read_frame', read)
    prediction = models.spinopelvic_prediction(np.zeros((768, 768), np.uint8))
    assert len(calls) == 2
    assert prediction['landmarks']['vertebrae']['L1']['superior'] == [[200., 150.], [400., 150.]]
    assert prediction['framing']['window'] == [0, 0, 768, 768]


def test_hrnet_rejects_degenerate_or_off_film_regressions_even_if_a_mask_is_present(monkeypatch):
    monkeypatch.setattr(framing, 'locate', lambda *args: None)
    output = frame(['L1', 'L2', 'L3'])
    for slot, (level, _) in enumerate(LANDMARKS):
        if level == 'L2': output['hrnet_points'][slot] = [200, 200]
        if level == 'L3': output['hrnet_points'][slot] = [-100, -100]
    monkeypatch.setattr(models, '_read_frame', lambda *args: output)
    result = models.spinopelvic_prediction(np.zeros((768, 768), np.uint8), models={'vertebrae': 'hrnet'})
    assert set(result['landmarks']['vertebrae']) == {'L1'}


def test_unet_keeps_anatomical_orientation_when_s1_is_available(monkeypatch):
    monkeypatch.setattr(framing, 'locate', lambda *args: None)
    monkeypatch.setattr(models, '_read_frame', lambda *args: frame(['L1'], np.array([[420., 650.], [220., 670.]])))
    result = models.spinopelvic_prediction(np.zeros((768, 768), np.uint8))
    body = result['landmarks']['vertebrae']['L1']
    assert body['superior'][0][0] > body['superior'][1][0]
    assert body.get('anterior_confirmed') is not False


@pytest.mark.parametrize('s1', [[[10., 10.], [10., 10.]], [[float('nan'), 5.], [20., 5.]],
                               [[-10., 20.], [10., 20.]]])
def test_invalid_s1_does_not_discard_a_valid_body(monkeypatch, s1):
    monkeypatch.setattr(framing, 'locate', lambda *args: None)
    monkeypatch.setattr(models, '_read_frame', lambda *args: frame(['L1'], np.array(s1)))
    result = models.spinopelvic_prediction(np.zeros((768, 768), np.uint8))
    assert set(result['landmarks']['vertebrae']) == {'L1'}
    assert result['landmarks']['S1']['superior'] is None


def test_letterbox_padding_cannot_supply_a_phantom_level(monkeypatch):
    monkeypatch.setattr(framing, 'locate', lambda *args: None)
    output = frame(['L1'])
    # A tall film occupies only the middle third of the model canvas.
    cv2.rectangle(output['vertebra_labels'], (10, 10), (100, 60), 2, -1)
    monkeypatch.setattr(models, '_read_frame', lambda *args: output)
    result = models.spinopelvic_prediction(np.zeros((1200, 400), np.uint8))
    assert 'L1' in result['landmarks']['vertebrae']
    assert 'L2' not in result['landmarks']['vertebrae']
