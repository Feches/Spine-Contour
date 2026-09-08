import io
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
from backend.server import app


def png():
    stream = io.BytesIO()
    Image.fromarray(np.zeros((80, 120, 3), np.uint8)).save(stream, format='PNG')
    return stream.getvalue()


def test_calibration_works_without_model_inference():
    response = TestClient(app).post('/calibrate', files={'file': ('image.png', png(), 'image/png')}, data={'preview_only': 'true'})
    assert response.status_code == 200
    assert response.json()['coordinate_space'] == 'original_image'
    assert response.json()['width'] == 120


def test_invalid_uploads_and_profiles():
    client = TestClient(app)
    assert client.post('/calibrate', files={'file': ('empty.png', b'', 'image/png')}).status_code == 400
    assert client.post('/calibrate', files={'file': ('bad.png', b'not an image', 'image/png')}).status_code == 422
    assert client.post('/calibrate', files={'file': ('image.png', png(), 'image/png')}, data={'profile': '{broken'}).status_code == 422


def test_learn_profile_rejects_out_of_image_points():
    response = TestClient(app).post('/calibration-profile', files={'file': ('image.png', png(), 'image/png')},
                                    data={'endpoints': '[[0, 0], [999, 999]]'})
    assert response.status_code == 422
