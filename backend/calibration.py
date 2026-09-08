"""Original-image calibration; OCR failure never prevents image analysis."""
from __future__ import annotations

import base64
import io
import logging
import os
from pathlib import Path
import sys

import cv2
import numpy as np
import pydicom
import pytesseract
from PIL import Image, UnidentifiedImageError

try:
    from .ruler_extraction import extract
except ImportError:
    from ruler_extraction import extract

log = logging.getLogger(__name__)
MAX_PIXELS = 25_000_000
UNIT_MM = {'mm': 1., 'cm': 10., 'um': .001, 'μm': .001, 'in': 25.4}


def configure_ocr():
    root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent.parent))
    bundled = root / 'ocr' / ('tesseract.exe' if os.name == 'nt' else 'tesseract')
    if bundled.is_file():
        pytesseract.pytesseract.tesseract_cmd = str(bundled)
        os.environ['TESSDATA_PREFIX'] = str(bundled.parent / 'tessdata')


def _decode(payload):
    spacing = None
    try:
        with Image.open(io.BytesIO(payload)) as source:
            if source.width * source.height > MAX_PIXELS:
                raise ValueError('Image is too large for ruler detection (maximum 25 megapixels).')
            rgb = np.asarray(source.convert('RGB'))
    except (UnidentifiedImageError, OSError):
        dataset = pydicom.dcmread(io.BytesIO(payload))
        pixels = np.asarray(dataset.pixel_array, dtype=float)
        if pixels.ndim != 2 or pixels.size > MAX_PIXELS:
            raise ValueError('Select a single-frame grayscale DICOM of at most 25 megapixels.')
        pixels = pixels * float(getattr(dataset, 'RescaleSlope', 1)) + float(getattr(dataset, 'RescaleIntercept', 0))
        lo, hi = np.percentile(pixels, [0.5, 99.5])
        gray = np.clip((pixels-lo) / max(hi-lo, 1e-9)*255, 0, 255).astype(np.uint8)
        if str(getattr(dataset, 'PhotometricInterpretation', '')).upper() == 'MONOCHROME1':
            gray = 255-gray
        rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
        # Never silently substitute detector-plane ImagerPixelSpacing.
        try:
            row, column = map(float, dataset.PixelSpacing)
            if np.isfinite([row, column]).all() and min(row, column) > 0:
                spacing = {'row_mm': row, 'column_mm': column, 'source': 'dicom_pixel_spacing'}
        except (AttributeError, TypeError, ValueError):
            pass
    return rgb, spacing


def calibration_from_payload(payload: bytes, profile=None, include_preview=True, preview_only=False):
    rgb, spacing = _decode(payload)
    height, width = rgb.shape[:2]
    # Keep a full-coordinate preview so references outside a segmentation crop remain editable.
    output = io.BytesIO()
    if include_preview:
        Image.fromarray(rgb).save(output, format='PNG')
    response = {
        'image_png': base64.b64encode(output.getvalue()).decode('ascii'),
        'width': width, 'height': height, 'coordinate_space': 'original_image',
        'spacing': spacing, 'candidates': [], 'selected_index': None,
        'status': 'dicom' if spacing else 'not_found',
        'message': 'Using DICOM pixel spacing.' if spacing else 'No reference found. Draw a reference and enter its length.',
    }
    if spacing or preview_only:
        return response
    configure_ocr()
    try:
        # Bound extraction cost; restore every coordinate and length to original pixels.
        factor = min(1., 2400 / max(height, width))
        frame = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        if factor < 1:
            frame = cv2.resize(frame, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA)
        sx, sy = width/frame.shape[1], height/frame.shape[0]
        extraction = extract(frame, validate_profile(profile))
        for label in extraction['measurements']:
            ruler = label.get('ruler')
            if not ruler or label['value'] <= 0 or label['unit'] not in UNIT_MM:
                continue
            endpoints = (np.asarray(ruler['endpoints']) + .5) * [sx, sy] - .5
            length = float(np.linalg.norm(endpoints[1]-endpoints[0]))
            if length < 2:
                continue
            x, y, w, h = label['text_box']
            value_mm = label['value'] * UNIT_MM[label['unit']]
            response['candidates'].append({
                'value_mm': value_mm, 'raw_text': label['raw_text'], 'flag': label.get('flag'),
                'endpoints': endpoints.tolist(), 'length_px': length, 'mm_per_pixel': value_mm/length,
                'text_box': [x*sx, y*sy, w*sx, h*sy], 'status': label['status'],
                'ocr_confidence': label['ocr_confidence'],
            })
        accepted = [(i, c) for i, c in enumerate(response['candidates']) if c['status'] == 'accepted']
        if accepted:
            scales = [c['mm_per_pixel'] for _, c in accepted]
            if max(scales)/min(scales) <= 1.05:
                chosen, candidate = max(accepted, key=lambda pair: pair[1]['length_px'])
                response.update(selected_index=chosen, status='detected',
                                message='Image scale detected from the printed ruler. You can adjust the reference below.')
                response['spacing'] = {'row_mm': candidate['mm_per_pixel'], 'column_mm': candidate['mm_per_pixel'], 'source': 'printed_ruler'}
            else:
                response.update(status='conflicting', message='Detected references imply different scales. Select the reference for this image and apply it.')
        elif response['candidates']:
            response.update(status='ambiguous', message='Check the detected reference, then apply its length.')
    except Exception as error:
        log.warning('Optional ruler extraction unavailable: %s', error)
        response.update(status='unavailable', message='Automatic ruler detection is unavailable. Draw a reference and enter its length.')
    return response


def validate_profile(profile):
    if profile is None:
        return None
    color = np.asarray(profile.get('foreground_rgb'), dtype=float)
    tolerance = float(profile.get('tolerance', 55))
    if color.shape != (3,) or not np.isfinite(color).all() or np.any(color < 0) or np.any(color > 255):
        raise ValueError('Reference color must contain three RGB values from 0 to 255.')
    if not np.isfinite(tolerance) or not 5 <= tolerance <= 100:
        raise ValueError('Color tolerance must be between 5 and 100.')
    return {'foreground_rgb': color.tolist(), 'tolerance': tolerance}


def learn_profile(payload, endpoints):
    rgb, _ = _decode(payload)
    points = np.asarray(endpoints, dtype=float)
    if points.shape != (2, 2) or not np.isfinite(points).all() or np.linalg.norm(points[1]-points[0]) < 8:
        raise ValueError('Place two reference endpoints at least eight pixels apart.')
    if np.any(points < 0) or np.any(points[:, 0] >= rgb.shape[1]) or np.any(points[:, 1] >= rgb.shape[0]):
        raise ValueError('Reference endpoints must be inside the image.')
    # Sample the corrected shaft, avoiding caps and their dark outlines.
    positions = points[0] + np.linspace(.12, .88, 101)[:, None] * (points[1]-points[0])
    coordinates = np.round(positions).astype(int)
    samples = rgb[coordinates[:, 1], coordinates[:, 0]].astype(float)
    buckets = (samples // 24).astype(int)
    _, inverse, counts = np.unique(buckets, axis=0, return_inverse=True, return_counts=True)
    dominant = samples[inverse == counts.argmax()]
    color = np.median(dominant, axis=0)
    return {'foreground_rgb': color.tolist(), 'tolerance': 55.,
            'sample_count': int(len(samples)), 'source': 'corrected_reference',
            'version': 1}
