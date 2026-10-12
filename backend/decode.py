"""Decode the original film for the renderer's display-only window / level.

The stored result image is an 8-bit percentile stretch, so the viewer cannot
window it. This module returns the uploaded file's own pixels instead: 16-bit,
with the value range and, for DICOM, the file's default window. It is stateless
and runs no model.
"""

from __future__ import annotations

import base64
import io

import numpy as np
import pydicom
from PIL import Image, UnidentifiedImageError
from pydicom.multival import MultiValue

try:
    from .calibration import MAX_PIXELS  # the same 25-megapixel cap the ruler decode applies
except ImportError:  # Support `uvicorn server:app` from backend/.
    from calibration import MAX_PIXELS

NOT_READABLE = "The upload is not a readable image or grayscale DICOM file"
TOO_LARGE = "The image is too large to display (maximum 25 megapixels)."
UINT16_MAX = 65535


def _first(value):
    """A DICOM multi-value (WindowCenter 2048\\1000) contributes its first element."""
    if isinstance(value, (list, tuple, MultiValue)):
        return value[0] if len(value) else None
    return value


def _dicom_window(dataset, invert_around):
    """{"center", "width"} from the file's tags, inverted with the pixels; None when absent or unusable."""
    try:
        center, width = _first(dataset.get("WindowCenter")), _first(dataset.get("WindowWidth"))
        if center is None or width is None:
            return None
        center, width = float(center), float(width)
    except (TypeError, ValueError):
        return None
    if not (np.isfinite(center) and np.isfinite(width)) or width <= 0:
        return None
    if invert_around is not None:
        center = invert_around - center
    return {"center": center, "width": width}


def _dicom(payload):
    """(pixels, bits_stored, window, photometric) of a single-frame grayscale DICOM."""
    try:
        dataset = pydicom.dcmread(io.BytesIO(payload))
        rows, columns = dataset.get("Rows"), dataset.get("Columns")
        if rows and columns and int(rows) * int(columns) > MAX_PIXELS:
            raise ValueError(TOO_LARGE)
        raw = np.asarray(dataset.pixel_array)
    except ValueError:
        raise
    except Exception as error:
        raise ValueError(NOT_READABLE) from error
    if raw.ndim != 2:
        raise ValueError("Only single-frame grayscale DICOM files are supported")
    if raw.size > MAX_PIXELS:
        raise ValueError(TOO_LARGE)
    pixels = raw.astype(np.float64)
    try:
        slope = float(dataset.get("RescaleSlope", 1.0))
        intercept = float(dataset.get("RescaleIntercept", 0.0))
    except (TypeError, ValueError) as error:
        raise ValueError(NOT_READABLE) from error
    pixels *= slope
    pixels += intercept
    photometric = dataset.get("PhotometricInterpretation")
    photometric = None if photometric is None else str(photometric).strip()
    invert_around = None
    if photometric is not None and photometric.upper() == "MONOCHROME1":
        # The same inversion as server._dicom_pixel_array: the range stays put, the order flips.
        invert_around = float(pixels.max() + pixels.min())
        np.subtract(invert_around, pixels, out=pixels)
    bits_stored = dataset.get("BitsStored")
    return (pixels, None if bits_stored is None else int(bits_stored),
            _dicom_window(dataset, invert_around), photometric)


def _image(payload):
    """(pixels, bits_stored) of an image Pillow reads, or None when Pillow does not recognise the file."""
    try:
        with Image.open(io.BytesIO(payload)) as image:
            if image.width * image.height > MAX_PIXELS:
                raise ValueError(TOO_LARGE)
            mode = image.mode
            # 16-bit and float modes keep their precision; anything else is an 8-bit film.
            if mode in ("I", "F") or mode.startswith("I;16"):
                pixels = np.array(image)
                # `I` is a 32-bit container and `F` a float one: neither says how many bits the scanner stored.
                return pixels, 16 if mode.startswith("I;16") else None
            return np.asarray(image.convert("L")), 8
    except Image.DecompressionBombError as error:
        raise ValueError(TOO_LARGE) from error
    except (UnidentifiedImageError, OSError):
        return None


def decode_film(payload: bytes) -> dict:
    """The original film as 16-bit pixels plus what a window / level needs to interpret them.

    Returns {"width", "height", "bits_stored" (int | None), "value_min", "value_max" (floats, after RescaleSlope /
    RescaleIntercept and the MONOCHROME1 inversion), "window" ({"center", "width"} | None: the DICOM WindowCenter /
    WindowWidth, first value of a multi-value, inverted with the pixels for MONOCHROME1), "photometric" (str | None),
    "scaled" (bool), "pixels_base64"}. `pixels_base64` is little-endian uint16 of round(value - value_min), row-major;
    when the range exceeds 16 bits it is scaled into 0..65535 and `scaled` is true, so
    value = pixel * (value_max - value_min) / 65535 + value_min (otherwise value = pixel + value_min).
    Raises ValueError for anything that is not a single-frame grayscale image or DICOM, or exceeds 25 megapixels.
    """
    decoded = _image(payload)
    if decoded is not None:
        pixels, bits_stored = decoded
        window, photometric = None, None
    else:
        pixels, bits_stored, window, photometric = _dicom(payload)
    if pixels.ndim != 2 or pixels.size == 0:
        raise ValueError("Only single-frame grayscale images are supported")
    value_min, value_max = float(pixels.min()), float(pixels.max())
    if not (np.isfinite(value_min) and np.isfinite(value_max)):
        raise ValueError("The image contains pixel values that are not finite numbers")
    span = value_max - value_min
    shifted = np.subtract(pixels, value_min, dtype=np.float64)
    scaled = span > UINT16_MAX
    if scaled:
        shifted *= UINT16_MAX / span
    encoded = np.clip(np.rint(shifted), 0, UINT16_MAX).astype("<u2")
    height, width = pixels.shape
    return {"width": int(width), "height": int(height), "bits_stored": bits_stored,
            "value_min": value_min, "value_max": value_max, "window": window, "photometric": photometric,
            "scaled": bool(scaled), "pixels_base64": base64.b64encode(encoded.tobytes()).decode("ascii")}
