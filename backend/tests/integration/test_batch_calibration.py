"""The shared /predict path calibrates every batch image without model dependencies."""
import io
import json
import shutil

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from backend import calibration, server


def image_bytes():
    image = np.zeros((260, 420, 3), np.uint8)
    cv2.line(image, (320, 40), (320, 120), (255, 255, 255), 1)
    for y in (40, 120):
        cv2.line(image, (314, y), (326, y), (255, 255, 255), 1)
    cv2.putText(image, '25.4 mm', (255, 165), cv2.FONT_HERSHEY_SIMPLEX, .8, (255, 255, 255), 2)
    stream = io.BytesIO(); Image.fromarray(image).save(stream, format='PNG')
    return stream.getvalue()


@pytest.fixture
def client(monkeypatch):
    def cropped_prediction(pixels, *_):
        image = pixels[:100, :100]
        return {'image': image, 'mask': np.zeros_like(image), 'femoral_mask': np.zeros_like(image),
                'landmarks': {'vertebrae': {}, 'S1': {'superior': []}},
                'models': {}, 'framing': {'window': [0, 0, 100, 100]}}
    monkeypatch.setattr(server, 'spinopelvic_prediction', cropped_prediction)
    monkeypatch.setattr(server, 'spinopelvic_measurements_from_landmarks',
                        lambda *_: {'measurements': {'SS': 30}, 'geometry': {}})
    return TestClient(server.app)


def predict(client, payload, cached=None):
    return client.post('/predict', files={'file': ('film.png', payload, 'image/png')},
                       data={'modality': 'xray', 'body_part': 'lumbar',
                             **({'calibration': json.dumps(cached)} if cached else {})})


@pytest.mark.skipif(not shutil.which('tesseract'), reason='Tesseract required')
def test_batch_path_detects_off_crop_reference_from_original_bytes(client):
    response = predict(client, image_bytes())
    assert response.status_code == 200
    result = response.json()['calibration']
    assert result['status'] == 'detected'
    assert result['width'] == 420
    assert result['candidates'][result['selected_index']]['value_mm'] == 25.4
    assert result['candidates'][result['selected_index']]['endpoints'][0][0] > 300
    assert 'image_png' not in result


def test_missing_ocr_or_calibration_error_does_not_fail_segmentation(client, monkeypatch):
    def fail(*_, **__):
        raise RuntimeError('OCR not available')
    monkeypatch.setattr(server, 'calibration_from_payload', fail)
    result = predict(client, image_bytes())
    assert result.status_code == 200
    assert result.json()['measurements']['SS'] == 30
    assert result.json()['calibration']['status'] == 'unavailable'
    assert result.json()['calibration']['spacing'] is None


def test_batch_reuses_reviewed_scale_only_for_matching_image(client, monkeypatch):
    payload = image_bytes()
    cached = calibration.calibration_from_payload(payload, preview_only=True)
    cached.update(status='corrected', selected_index=0,
                  candidates=[{'value_mm': 40, 'length_px': 80, 'endpoints': [[320, 40], [320, 120]],
                               'raw_text': '40 mm (corrected)', 'status': 'accepted'}])
    monkeypatch.setattr(calibration, 'extract', lambda *_: pytest.fail('Saved reference should avoid OCR'))
    result = predict(client, payload, cached).json()['calibration']
    assert result['status'] == 'corrected'
    assert result['spacing']['row_mm'] == .5


def test_no_reference_leaves_lengths_unavailable(client, monkeypatch):
    monkeypatch.setattr(calibration, 'extract', lambda *_: {'measurements': []})
    result = predict(client, image_bytes()).json()
    assert result['measurements']['SS'] == 30
    assert result['calibration']['status'] == 'not_found'
    assert result['calibration']['spacing'] is None
