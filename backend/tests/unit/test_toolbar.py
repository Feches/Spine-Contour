import cv2
import numpy as np
import pytest

from backend import framing, runtime, toolbar
from backend.models import models
from backend.tests.unit.test_partial_prediction import frame


def screenshot(width=951, height=801, thickness=22, invert=False):
    image = np.random.default_rng(71).integers(35, 180, (height, width), dtype=np.uint8)
    image[-thickness:] = 235
    for fraction, text in zip((.02, .25, .50, .80), ('C:32766', '2D', '27%', 'MENU')):
        cv2.putText(image, text, (int(width * fraction), height - max(3, thickness // 5)),
                    cv2.FONT_HERSHEY_SIMPLEX, thickness / 40, 15, 1, cv2.LINE_8)
    return 255 - image if invert else image


@pytest.mark.parametrize('width', [600, 951, 1906])
@pytest.mark.parametrize('thickness', [14, 22, 50])
@pytest.mark.parametrize('invert', [False, True])
def test_toolbar_removes_only_edge_panel_and_preserves_every_remaining_pixel(width, thickness, invert):
    image = screenshot(width=width, thickness=thickness, invert=invert)
    original = image.copy()
    clean, details = toolbar.remove_bottom_toolbar(image)
    assert details['status'] == 'removed'
    assert details['removed_bottom_px'] == thickness
    assert details['source_size'] == [width, 801]
    assert details['window'] == [0, 0, width, 801-thickness]
    np.testing.assert_array_equal(clean, original[:-thickness])
    np.testing.assert_array_equal(image, original)
    again, info = toolbar.remove_bottom_toolbar(clean)
    assert again is clean and info['status'] == 'not_found'


@pytest.mark.parametrize('kind', ['blank', 'noise', 'flat_edge', 'one_label', 'clustered_labels',
                                  'interior_panel', 'top_panel', 'side_panel', 'thick_panel', 'thin_panel'])
def test_uncertain_or_non_bottom_content_is_kept(kind):
    image = screenshot()
    if kind == 'blank': image[:] = 0
    if kind == 'noise': image = np.random.default_rng(4).integers(0, 255, image.shape, dtype=np.uint8)
    if kind == 'flat_edge': image[-22:] = 235
    if kind in ('one_label', 'clustered_labels'):
        image[-22:] = 235
        cv2.putText(image, 'L' if kind == 'one_label' else 'C:2736 W:46283', (10, 796),
                    cv2.FONT_HERSHEY_SIMPLEX, .5, 15, 1)
    if kind == 'interior_panel': image = np.concatenate([image, image[:100]])
    if kind == 'top_panel': image = image[::-1].copy()
    if kind == 'side_panel': image = np.rot90(image).copy()
    if kind == 'thick_panel': image = screenshot(thickness=150)
    if kind == 'thin_panel': image = screenshot(thickness=5)
    clean, details = toolbar.remove_bottom_toolbar(image)
    assert clean is image
    assert details['removed_bottom_px'] == 0


@pytest.mark.parametrize('dtype', [np.uint16, np.int32, np.float32, np.float64])
def test_native_precision_images_are_not_normalized_or_cropped(dtype):
    image = screenshot().astype(dtype)
    clean, details = toolbar.remove_bottom_toolbar(image)
    assert clean is image and clean.dtype == dtype
    assert details['status'] == 'unsupported_image'


@pytest.mark.parametrize('shape', [(1, 1), (127, 951), (128, 951), (132, 951)])
def test_tiny_images_do_not_fail(shape):
    image = np.zeros(shape, np.uint8)
    assert toolbar.remove_bottom_toolbar(image)[0] is image


@pytest.mark.parametrize('localizer', [True, False])
@pytest.mark.parametrize('model', ['unet', 'hrnet'])
def test_cleanup_precedes_search_and_preserves_source_coordinates_and_partial_results(monkeypatch, localizer, model):
    image = screenshot()
    searched = []
    monkeypatch.setattr(framing, 'locate', lambda pixels, *_: searched.append(pixels.copy()))
    monkeypatch.setattr(models, '_read_frame', lambda *_: frame(['L1']))
    with runtime.session(runtime.parse_options(crop_localizer=localizer)):
        reference = models.spinopelvic_prediction(image[:-22], models={'vertebrae': model})
    events = []
    with runtime.session(runtime.parse_options(crop_localizer=localizer, toolbar_removal=True), events.append):
        result = models.spinopelvic_prediction(image, models={'vertebrae': model})
    for key in ('image', 'mask', 'femoral_mask'):
        np.testing.assert_array_equal(result[key], reference[key])
    assert result['landmarks'] == reference['landmarks']
    assert list(result['landmarks']['vertebrae']) == ['L1']
    assert result['landmarks']['S1']['superior'] is None
    assert result['framing']['window'] == reference['framing']['window']
    assert result['framing']['toolbar_removal']['removed_bottom_px'] == 22
    assert events[1]['stage'] == 'toolbar'
    if localizer:
        np.testing.assert_array_equal(searched[-1], image[:-22])
    else:
        assert not searched


def test_disabled_cleanup_bypasses_detector_and_retains_original_extent(monkeypatch):
    image = screenshot()
    monkeypatch.setattr(toolbar, 'remove_bottom_toolbar', lambda *_: pytest.fail('Disabled must not scan'))
    monkeypatch.setattr(models, '_read_frame', lambda *_: frame(['L1']))
    with runtime.session(runtime.parse_options(crop_localizer=False)):
        result = models.spinopelvic_prediction(image)
    assert result['image'].shape == image.shape
    assert result['framing']['toolbar_removal']['status'] == 'disabled'


def test_toolbar_option_defaults_off_and_rejects_non_booleans():
    assert runtime.parse_options().toolbar_removal is False
    for invalid in (None, 'false', 0, 1):
        with pytest.raises(ValueError): runtime.parse_options(toolbar_removal=invalid)
