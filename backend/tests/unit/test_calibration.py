import io
import shutil

import cv2
import numpy as np
import pytest
from PIL import Image

from backend import calibration
from backend.ruler_extraction import find_rulers


def sample(color=(255, 255, 255), x=110):
    rgb = np.full((260, 420, 3), 20, np.uint8)
    cv2.line(rgb, (x, 60), (x, 140), color, 1)
    cv2.line(rgb, (x-6, 60), (x+6, 60), color, 1)
    cv2.line(rgb, (x-6, 140), (x+6, 140), color, 1)
    cv2.putText(rgb, '25.4 mm', (x-60, 180), cv2.FONT_HERSHEY_SIMPLEX, .85, color, 2, cv2.LINE_AA)
    stream = io.BytesIO(); Image.fromarray(rgb).save(stream, format='PNG')
    return stream.getvalue()


@pytest.mark.skipif(not shutil.which('tesseract'), reason='Tesseract required for real OCR check')
def test_end_to_end_png():
    result = calibration.calibration_from_payload(sample())
    assert result['status'] == 'detected'
    assert result['candidates'][0]['value_mm'] == 25.4
    assert result['candidates'][0]['length_px'] == pytest.approx(80, abs=1)
    assert result['spacing']['row_mm'] == pytest.approx(25.4/80, abs=.005)


def test_ocr_failure_preserves_manual_preview(monkeypatch):
    monkeypatch.setattr(calibration, 'extract', lambda *_: (_ for _ in ()).throw(RuntimeError('missing OCR')))
    result = calibration.calibration_from_payload(sample())
    assert result['status'] == 'unavailable'
    assert result['image_png']
    assert result['spacing'] is None


def test_conflicting_scales_not_silently_selected(monkeypatch):
    def label(value, x):
        return {'value': value, 'unit': 'mm', 'raw_text': f'{value} mm', 'text_box': [x, 0, 40, 20],
                'status': 'accepted', 'ocr_confidence': .99,
                'ruler': {'endpoints': [[x, 20], [x, 100]]}}
    monkeypatch.setattr(calibration, 'extract', lambda *_: {'measurements': [label(20, 30), label(40, 100)]})
    result = calibration.calibration_from_payload(sample())
    assert result['status'] == 'conflicting'
    assert result['spacing'] is None
    assert result['selected_index'] is None


def test_dicom_spacing_bypasses_ocr_and_keeps_anisotropy(monkeypatch):
    spacing = {'row_mm': .4, 'column_mm': .2, 'source': 'dicom_pixel_spacing'}
    monkeypatch.setattr(calibration, '_decode', lambda _: (np.zeros((30, 40, 3), np.uint8), spacing))
    monkeypatch.setattr(calibration, 'extract', lambda *_: pytest.fail('OCR should not run'))
    assert calibration.calibration_from_payload(b'dicom')['spacing'] == spacing


def test_profile_samples_corrected_color_and_transfers_location():
    profile = calibration.learn_profile(sample(color=(30, 200, 120)), [[110, 60], [110, 140]])
    assert profile['foreground_rgb'] == [30, 200, 120]
    assert 'mm_per_pixel' not in profile
    image = np.asarray(Image.open(io.BytesIO(sample(color=(30, 200, 120), x=240))).convert('RGB'))
    candidates = find_rulers(cv2.cvtColor(image, cv2.COLOR_RGB2BGR), profile)
    assert any(c['length_px'] == pytest.approx(80, abs=1) for c in candidates)


def test_preview_only_does_not_repeat_extraction(monkeypatch):
    monkeypatch.setattr(calibration, 'extract', lambda *_: pytest.fail('OCR should not run'))
    assert calibration.calibration_from_payload(sample(), preview_only=True)['image_png']


def test_batch_results_can_omit_large_preview():
    assert calibration.calibration_from_payload(sample(), include_preview=False, preview_only=True)['image_png'] == ''


def test_invalid_profile_and_endpoints_rejected():
    with pytest.raises(ValueError):
        calibration.validate_profile({'foreground_rgb': [0, 255, 300]})
    with pytest.raises(ValueError):
        calibration.learn_profile(sample(), [[-3, 10], [20, 30]])


@pytest.mark.parametrize('length', [50, 51, 67, 76, 100])
@pytest.mark.parametrize('angle', [0, 15, 45, 90, 120])
def test_odd_and_even_ruler_lengths_at_different_orientations(length, angle):
    image = np.zeros((240, 320, 3), np.uint8)
    axis = np.array([np.cos(np.deg2rad(angle)), np.sin(np.deg2rad(angle))])
    normal = np.array([-axis[1], axis[0]])
    endpoints = np.array([160, 120]) + np.array([-1, 1])[:, None]*axis*length/2
    integer = lambda p: tuple(np.round(p).astype(int))
    cv2.line(image, integer(endpoints[0]), integer(endpoints[1]), (255, 255, 255), 1, cv2.LINE_AA)
    for point in endpoints:
        cv2.line(image, integer(point-6*normal), integer(point+6*normal), (255, 255, 255), 1, cv2.LINE_AA)
    candidates = find_rulers(image)
    assert any(abs(candidate['length_px']-length)<2 for candidate in candidates)
