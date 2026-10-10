"""POST /decode's core: the original film's pixels, range and DICOM window defaults."""

import base64
import io

import numpy as np
import pytest
from PIL import Image
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid

from backend.decode import decode_film


def png(array):
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="PNG")
    return buffer.getvalue()


def pixels_of(result):
    data = np.frombuffer(base64.b64decode(result["pixels_base64"]), dtype="<u2")
    return data.reshape(result["height"], result["width"])


def dicom(array, photometric="MONOCHROME2", bits_stored=12, window=(2048, 4096), slope=1, intercept=0):
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    dataset = FileDataset("film.dcm", {}, file_meta=meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = meta.MediaStorageSOPClassUID
    dataset.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    dataset.Rows, dataset.Columns = array.shape
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = photometric
    dataset.BitsAllocated = 16
    dataset.BitsStored = bits_stored
    dataset.HighBit = bits_stored - 1
    dataset.PixelRepresentation = 0
    dataset.RescaleSlope = slope
    dataset.RescaleIntercept = intercept
    if window is not None:
        dataset.WindowCenter, dataset.WindowWidth = window
    dataset.PixelData = np.ascontiguousarray(array, dtype="<u2").tobytes()
    buffer = io.BytesIO()
    dataset.save_as(buffer)
    return buffer.getvalue()


def ramp(height=8, width=16, top=4000):
    return np.linspace(0, top, height * width).round().astype(np.uint16).reshape(height, width)


def test_eight_bit_png_round_trips():
    array = np.tile(np.arange(0, 256, dtype=np.uint8), (4, 1))
    result = decode_film(png(array))
    assert (result["width"], result["height"]) == (256, 4)
    assert result["value_min"] == 0 and result["value_max"] == 255
    assert result["bits_stored"] == 8
    assert result["window"] is None
    assert result["photometric"] is None
    assert result["scaled"] is False
    np.testing.assert_array_equal(pixels_of(result), array)


def test_sixteen_bit_png_keeps_the_full_range():
    array = ramp()
    assert array.max() == 4000
    result = decode_film(png(array))
    assert result["value_min"] == 0 and result["value_max"] == 4000
    assert result["bits_stored"] == 16
    assert result["window"] is None
    np.testing.assert_array_equal(pixels_of(result), array)


def test_pixels_are_offset_by_the_minimum():
    array = ramp() + 500
    result = decode_film(png(array))
    assert result["value_min"] == 500 and result["value_max"] == 4500
    np.testing.assert_array_equal(pixels_of(result), array - 500)
    assert result["scaled"] is False


def test_pixels_are_little_endian_and_c_contiguous():
    array = np.array([[0, 1, 258], [3, 4, 5]], dtype=np.uint16)
    raw = base64.b64decode(decode_film(png(array))["pixels_base64"])
    assert raw[:6] == b"\x00\x00\x01\x00\x02\x01"
    assert len(raw) == array.size * 2


def test_dicom_monochrome2_reports_the_window_and_bits_stored():
    array = ramp()
    result = decode_film(dicom(array))
    assert result["bits_stored"] == 12
    assert result["window"] == {"center": 2048, "width": 4096}
    assert result["photometric"] == "MONOCHROME2"
    assert result["value_min"] == 0 and result["value_max"] == 4000
    np.testing.assert_array_equal(pixels_of(result), array)


def test_dicom_applies_rescale_slope_and_intercept():
    array = ramp()
    result = decode_film(dicom(array, slope=2, intercept=-1000))
    assert result["value_min"] == -1000 and result["value_max"] == 7000
    np.testing.assert_array_equal(pixels_of(result), array.astype(np.int64) * 2)


def test_dicom_monochrome1_inverts_the_pixels_and_the_window_centre():
    array = ramp()
    result = decode_film(dicom(array, photometric="MONOCHROME1"))
    low, high = int(array.min()), int(array.max())
    assert result["photometric"] == "MONOCHROME1"
    assert result["value_min"] == low and result["value_max"] == high
    np.testing.assert_array_equal(pixels_of(result), (high + low) - array.astype(np.int64) - low)
    assert result["window"] == {"center": (high + low) - 2048, "width": 4096}


def test_dicom_multi_value_window_takes_the_first():
    result = decode_film(dicom(ramp(), window=([2048, 1000], [4096, 500])))
    assert result["window"] == {"center": 2048, "width": 4096}
    assert isinstance(result["window"]["center"], float)


def test_dicom_without_a_complete_window_reports_none():
    assert decode_film(dicom(ramp(), window=None))["window"] is None


def test_dicom_with_an_unusable_window_reports_none_instead_of_failing():
    assert decode_film(dicom(ramp(), window=(2048, 0)))["window"] is None


def test_a_32_bit_integer_image_does_not_claim_a_bit_depth():
    array = (np.arange(24, dtype=np.int32).reshape(4, 6) * 1000) - 5000
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="TIFF")
    result = decode_film(buffer.getvalue())
    assert result["bits_stored"] is None
    assert result["value_min"] == -5000 and result["value_max"] == 18000
    np.testing.assert_array_equal(pixels_of(result), array + 5000)


def test_a_range_over_sixteen_bits_is_scaled_into_it():
    array = np.array([[-5000.0, 0.0, 70000.0]], dtype=np.float32)
    buffer = io.BytesIO()
    Image.fromarray(array, mode="F").save(buffer, format="TIFF")
    result = decode_film(buffer.getvalue())
    assert result["scaled"] is True
    assert result["value_min"] == -5000.0 and result["value_max"] == 70000.0
    assert result["bits_stored"] is None
    pixels = pixels_of(result)
    assert pixels[0, 0] == 0 and pixels[0, 2] == 65535


def test_garbage_is_a_value_error():
    with pytest.raises(ValueError, match="not a readable image"):
        decode_film(b"not an image")


def test_more_than_twenty_five_megapixels_is_a_value_error():
    with pytest.raises(ValueError):
        decode_film(png(np.zeros((5000, 6000), dtype=np.uint8)))
