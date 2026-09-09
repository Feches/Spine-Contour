import io

import numpy as np
import pytest
from PIL import Image

from backend.server import _decode_grayscale
from backend.models.models import _robust_rescale


@pytest.mark.parametrize("format", ["PNG", "TIFF"])
def test_high_bit_depth_grayscale_retains_contrast_before_model_rescaling(format):
    pixels = np.linspace(512, 4095, 4096).reshape(64, 64).astype(np.uint16)
    upload = io.BytesIO()
    Image.fromarray(pixels).save(upload, format=format)
    decoded = _decode_grayscale(upload.getvalue())
    np.testing.assert_array_equal(decoded, pixels)
    # Previously every pixel became 255 before inference could normalise it.
    normalised = _robust_rescale(decoded)
    assert normalised.dtype == np.uint8
    assert np.unique(normalised).size > 200
    assert normalised[0, 0] < normalised[-1, -1]


def test_floating_point_tiff_preserves_fractional_and_negative_intensities():
    pixels = np.linspace(-300.5, 4095.25, 256).reshape(16, 16).astype(np.float32)
    upload = io.BytesIO()
    Image.fromarray(pixels).save(upload, format="TIFF")
    np.testing.assert_array_equal(_decode_grayscale(upload.getvalue()), pixels)


@pytest.mark.parametrize("mode", ["L", "RGB", "RGBA"])
def test_eight_bit_and_colour_inputs_keep_existing_luminance_conversion(mode):
    source = Image.fromarray(np.arange(256, dtype=np.uint8).reshape(16, 16)).convert(mode)
    upload = io.BytesIO()
    source.save(upload, format="PNG")
    np.testing.assert_array_equal(_decode_grayscale(upload.getvalue()), np.asarray(source.convert("L")))
