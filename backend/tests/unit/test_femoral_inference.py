"""The model recipe must survive export, flipping, padding and crop restoration."""
import cv2
import numpy as np

from backend import framing
from backend.models import models


def test_native_contrast_precedes_letterboxing():
    image = np.random.default_rng(42).integers(0, 256, (421, 183), dtype=np.uint8)
    expected = cv2.createCLAHE(clipLimit=2., tileGridSize=(8, 8)).apply(models._robust_rescale(image))
    canvas, _ = models._letterbox(expected)
    expected = cv2.resize(canvas, (640, 640), interpolation=cv2.INTER_AREA)
    actual = models._femoral_input(image)
    assert actual.shape == (1, 1, 640, 640)
    assert actual.dtype == np.float32
    np.testing.assert_allclose(actual, models._segmentation_input(expected))
    # Empty letterbox margins are padding, not CLAHE image content.
    np.testing.assert_allclose(actual[0, 0, :, :100], -np.float32(.449) / np.float32(.226))


def test_flipped_probabilities_are_unflipped_before_averaging(monkeypatch):
    calls = []
    class Session:
        def run(self, _, inputs):
            calls.append(inputs['image'].copy())
            output = np.full((1, 1, 640, 640), -2., np.float32)
            # A feature predicted on the LEFT in both input orientations belongs
            # to opposite sides of the source image after unflipping.
            output[..., :160] = 2.
            return [output]
    monkeypatch.setattr(models, '_infer', lambda kind, operation, message: operation(Session()))
    image = np.tile(np.arange(256, dtype=np.uint8), (300, 1))
    probability = models._femoral_probabilities(image)
    assert len(calls) == 2
    np.testing.assert_array_equal(calls[1], calls[0][..., ::-1])
    assert probability.shape == (768, 768)
    np.testing.assert_allclose(probability[384, [30, 738]], .5, atol=1e-6)
    assert probability[384, 384] < .13


def test_probability_restoration_preserves_one_partial_head_and_crop_offset():
    window = (11, 17, 71, 137)
    _, transform = framing.prepare_crop(np.zeros((180, 100), np.uint8), window)
    p = np.zeros((768, 768), np.float32)
    # One visible cap reaches the bottom of the crop; no second head is needed.
    cv2.circle(p, (384, 768), 90, .6, -1)
    mask = models._restore_femoral_mask(p, transform, (180, 100))
    assert mask.shape == (180, 100) and mask.dtype == np.uint8
    assert mask[136, 41] == 1
    assert not mask[:17].any() and not mask[137:].any()
    assert not mask[:, :11].any() and not mask[:, 71:].any()
    assert cv2.connectedComponents(mask)[0] == 2  # background + one head
    assert not models._restore_femoral_mask(p * 0, transform, mask.shape).any()
