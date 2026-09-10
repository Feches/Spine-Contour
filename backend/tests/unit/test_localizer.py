"""The OFF path must bypass search/reframing without suppressing any detector."""
import numpy as np
import pytest

from backend import framing, runtime
from backend.models import models
from backend.tests.unit.test_partial_prediction import frame


@pytest.mark.parametrize('model', ['unet', 'hrnet'])
@pytest.mark.parametrize('s1', [False, True])
@pytest.mark.parametrize('shape', [(768, 768), (1200, 600)])
def test_localizer_off_reads_full_extent_once_and_keeps_partial_anatomy(monkeypatch, model, s1, shape):
    seen, events = [], []
    image = np.random.default_rng(3).integers(0, 255, shape, np.uint8)
    def forbidden(*_):
        pytest.fail('OFF must not search or reframe')
    for function in ('locate', 'reframe'):
        monkeypatch.setattr(framing, function, forbidden)
    prediction = frame(['L1'])
    if s1:
        prediction['s1'] = np.array([[320., 610.], [410., 605.]])
        prediction['s1_confidence'] = .99
    def read(canvas, choice):
        seen.append((canvas, choice))
        return prediction
    monkeypatch.setattr(models, '_read_frame', read)
    with runtime.session(runtime.parse_options(crop_localizer=False), events.append):
        result = models.spinopelvic_prediction(image, models={'vertebrae': model})
    assert len(seen) == 1
    assert seen[0][1]['s1'] == 'keypointrcnn'
    assert seen[0][1]['femoral'] == 'unet'
    assert list(result['landmarks']['vertebrae']) == ['L1']
    assert (result['landmarks']['S1']['superior'] is not None) == s1
    assert result['framing']['window'] == [0, 0, shape[1], shape[0]]
    assert result['framing']['crop_localizer'] is False
    assert not result['framing']['searched'] and not result['framing']['reframed']
    assert not result['framing']['fallback_whole_film']
    assert all(event['stage'] != 'search' for event in events)
    assert result['mask'].shape == image.shape
    if shape == (1200, 600):
        # 768/1200 scale and 192 px side padding must be removed exactly once.
        quad = result['landmarks']['vertebrae']['L1']['quadrilateral']
        assert min(point[0] for point in quad) == pytest.approx(12.5)
        assert min(point[1] for point in quad) == pytest.approx(234.375)


def test_localizer_off_cleans_empty_screenshot_borders_without_model_search(monkeypatch):
    image = np.zeros((1600, 2000), np.uint8)
    image[400:1200, 600:1400] = np.random.default_rng(8).integers(30, 220, (800, 800), np.uint8)
    expected = framing.fallback_window(image)
    monkeypatch.setattr(framing, 'locate', lambda *_: pytest.fail('OFF must not run search'))
    monkeypatch.setattr(models, '_read_frame', lambda *_: frame(['L1']))
    with runtime.session(runtime.parse_options(crop_localizer=False)):
        result = models.spinopelvic_prediction(image)
    assert result['framing']['window'] == list(expected)
    assert result['framing']['trimmed_black_margins'] is True
    assert result['framing']['searched'] is False
    assert result['mask'].shape == image.shape
    quad = result['landmarks']['vertebrae']['L1']['quadrilateral']
    assert all(600 <= x < 1400 and 400 <= y < 1200 for x, y in quad)


def test_localizer_defaults_on_and_rejects_non_boolean_options():
    assert runtime.parse_options().crop_localizer is True
    for invalid in ('false', 0, None):
        with pytest.raises(ValueError): runtime.parse_options(crop_localizer=invalid)


def test_localizer_on_still_searches_and_preserves_no_s1_fallback(monkeypatch):
    calls = []
    monkeypatch.setattr(framing, 'locate', lambda *args: calls.append(True))
    monkeypatch.setattr(models, '_read_frame', lambda *_: frame(['L1']))
    with runtime.session():
        result = models.spinopelvic_prediction(np.zeros((768, 768), np.uint8))
    assert calls == [True]
    assert result['framing']['crop_localizer'] is True
    assert result['framing']['fallback_whole_film'] is True
