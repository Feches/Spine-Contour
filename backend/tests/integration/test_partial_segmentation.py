import base64
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend import framing, server
from backend.models import models
from backend.tests.unit.test_partial_prediction import frame


@pytest.mark.parametrize('model', ['unet', 'hrnet'])
@pytest.mark.parametrize('levels,s1', [(['L1'], None), (['L2', 'L4'], [[200, 650], [400, 630]])])
def test_predict_measure_and_json_round_trip_preserve_partial_results(monkeypatch, model, levels, s1):
    monkeypatch.setattr(framing, 'locate', lambda *args: None)
    monkeypatch.setattr(models, '_read_frame', lambda *args: frame(levels, None if s1 is None else np.array(s1)))
    calibration = {'version': 1, 'status': 'unavailable', 'spacing': None}
    monkeypatch.setattr(server, 'calibration_from_payload', lambda *args, **kwargs: dict(calibration))
    image = io.BytesIO()
    Image.fromarray(np.zeros((768, 768), np.uint8)).save(image, format='PNG')
    client = TestClient(server.app)
    response = client.post('/predict', data={'modality': 'xray', 'body_part': 'lumbar',
                                            'view': 'lateral', 'vertebra_model': model},
                           files={'file': ('partial.png', image.getvalue(), 'image/png')})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['calibration'] == calibration
    assert result['qc']['coverage']['partial'] is True
    assert result['qc']['models']['vertebrae'] == model
    assert set(result['geometry']['vertebrae']) == set(levels)
    assert result['geometry']['femoral_circles'] == []
    assert result['measurements']['PI'] is None
    mask = np.array(Image.open(io.BytesIO(base64.b64decode(result['mask_png']))))
    assert set(np.unique(mask)) == {0, *(19 + int(level[1]) for level in levels)}
    geometry = result['geometry']
    first = levels[0]
    geometry['vertebrae'][first]['superior'][0][1] += 5
    geometry['vertebrae'][first]['quadrilateral'][0][1] += 5
    measured = client.post('/measure', json=geometry)
    assert measured.status_code == 200, measured.text
    updated = measured.json()
    assert set(updated['geometry']['vertebrae']) == set(levels)
    assert updated['geometry']['s1_superior'] == s1
    assert updated['qc']['coverage']['missing'] == result['qc']['coverage']['missing']
    if s1:
        assert updated['measurements']['LL'][f'{first}-S1'] != result['measurements']['LL'][f'{first}-S1']
    else:
        assert all(v is None for v in updated['measurements']['LL'].values())
        if model == 'unet':
            assert updated['geometry']['vertebrae'][first]['anterior_confirmed'] is False


def test_empty_prediction_still_returns_a_clear_error(monkeypatch):
    monkeypatch.setattr(framing, 'locate', lambda *args: None)
    monkeypatch.setattr(models, '_read_frame', lambda *args: frame([]))
    image = io.BytesIO()
    Image.fromarray(np.zeros((768, 768), np.uint8)).save(image, format='PNG')
    response = TestClient(server.app).post('/predict', data={'modality': 'xray', 'body_part': 'lumbar', 'view': 'lateral'},
                                         files={'file': ('empty.png', image.getvalue(), 'image/png')})
    assert response.status_code == 422
    assert 'No usable' in response.json()['detail']


def test_malformed_partial_correction_is_rejected():
    response = TestClient(server.app).post('/measure', json={'vertebrae': {'L1': {'superior': [[0, 0]]}},
                                                          's1_superior': None, 'femoral_circles': []})
    assert response.status_code == 422
