"""Original-image calibration; OCR failure never prevents image analysis."""
from __future__ import annotations

import base64
import io
import hashlib
import logging
import os
from pathlib import Path
import shutil
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


def resolve_tesseract(env=None, which=shutil.which, exists=os.path.isfile, platform=os.name):
    """Find a system Tesseract binary when no bundled copy exists.

    Checked in order: an explicit TESSERACT_CMD override, the PATH, then the
    standard per-OS install folders. Returns the chosen path, or None if
    nothing was found. Pure aside from the injectable env/which/exists, so it
    can be unit-tested without touching the real machine.
    """
    if env is None:
        env = os.environ
    override = env.get('TESSERACT_CMD')
    if override and exists(override):
        return override
    found = which('tesseract')
    if found:
        return found
    if platform == 'nt':
        candidates = []
        program_files = env.get('ProgramFiles')
        if program_files:
            candidates.append(os.path.join(program_files, 'Tesseract-OCR', 'tesseract.exe'))
        program_files_x86 = env.get('ProgramFiles(x86)')
        if program_files_x86:
            candidates.append(os.path.join(program_files_x86, 'Tesseract-OCR', 'tesseract.exe'))
        local_app_data = env.get('LOCALAPPDATA')
        if local_app_data:
            candidates.append(os.path.join(local_app_data, 'Programs', 'Tesseract-OCR', 'tesseract.exe'))
    else:
        candidates = ['/opt/homebrew/bin/tesseract', '/usr/local/bin/tesseract', '/usr/bin/tesseract']
    for candidate in candidates:
        if exists(candidate):
            return candidate
    return None


# Memoised OCR resolution: the bundled-copy check, the resolve_tesseract() lookup and the
# one log line only need to happen once per process, not once per image in a batch.
_OCR_RESOLVED = None
_OCR_RESOLVED_ONCE = False


def _resolve_ocr_once():
    """Determine the Tesseract command and TESSDATA_PREFIX (bundled copy, else system lookup).

    Runs the filesystem checks, the resolve_tesseract() PATH/install-folder scan, and logs
    the single OCR: info/warning line. Called at most once per process; configure_ocr()
    caches the result.
    """
    root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent.parent))
    bundled = root / 'ocr' / ('tesseract.exe' if os.name == 'nt' else 'tesseract')
    if bundled.is_file():
        return str(bundled), str(bundled.parent / 'tessdata')
    # No bundled copy (source launch): fall back to a system install. Unlike
    # the bundled case, we do not set TESSDATA_PREFIX -- a system Tesseract
    # finds its own tessdata.
    resolved = resolve_tesseract()
    if resolved:
        log.info('OCR: using %s', resolved)
    else:
        log.warning('OCR: no Tesseract binary found on PATH or in the standard install folders; '
                     'automatic ruler detection will be unavailable.')
    return resolved, None


def configure_ocr():
    global _OCR_RESOLVED, _OCR_RESOLVED_ONCE
    if not _OCR_RESOLVED_ONCE:
        _OCR_RESOLVED = _resolve_ocr_once()
        _OCR_RESOLVED_ONCE = True
    tesseract_cmd, tessdata_prefix = _OCR_RESOLVED
    # Cheap, so reapply on every call even though the lookup itself only ran once.
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    if tessdata_prefix:
        os.environ['TESSDATA_PREFIX'] = tessdata_prefix


def _reset_ocr_cache():
    """Test-only: clear the memoised OCR resolution so the next configure_ocr() re-resolves."""
    global _OCR_RESOLVED, _OCR_RESOLVED_ONCE
    _OCR_RESOLVED = None
    _OCR_RESOLVED_ONCE = False


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


def _cached_result(cached, response):
    """Reuse only a compact result for these exact file bytes and image dimensions."""
    if not isinstance(cached, dict) or any(cached.get(key) != response[key] for key in
            ('source_sha256', 'width', 'height', 'coordinate_space', 'version')):
        return None
    status = cached.get('status')
    if status not in ('detected', 'corrected', 'not_found', 'ambiguous', 'conflicting', 'cleared'):
        return None
    try:
        candidates = cached['candidates']
        if not isinstance(candidates, list) or len(candidates) > 128:
            return None
        for candidate in candidates:
            points = np.asarray(candidate['endpoints'], dtype=float)
            value = float(candidate['value_mm'])
            if (points.shape != (2, 2) or not np.isfinite(points).all()
                    or np.any(points < 0) or np.any(points[:, 0] >= response['width'])
                    or np.any(points[:, 1] >= response['height'])
                    or not np.isfinite(value) or value <= 0):
                return None
            length = float(np.linalg.norm(points[1] - points[0]))
            if length < 2 or not np.isclose(length, candidate['length_px'], rtol=1e-5):
                return None
        spacing = None
        index = cached.get('selected_index')
        if status in ('detected', 'corrected'):
            if type(index) is not int or not 0 <= index < len(candidates):
                return None
            candidate = candidates[index]
            if candidate.get('status') != 'accepted':
                return None
            scale = candidate['value_mm'] / candidate['length_px']
            spacing = {'row_mm': scale, 'column_mm': scale,
                       'source': 'manual_reference' if status == 'corrected' else 'printed_ruler'}
        elif index is not None or cached.get('spacing') is not None:
            return None
        result = {**response, 'status': status, 'spacing': spacing, 'candidates': candidates,
                  'selected_index': index, 'message': str(cached.get('message', ''))}
        revision = cached.get('review_revision')
        if type(revision) is int and 0 < revision <= 9007199254740991:
            result['review_revision'] = revision
        return result
    except (KeyError, TypeError, ValueError):
        return None


def calibration_from_payload(payload: bytes, profile=None, include_preview=True, preview_only=False, cached=None):
    rgb, spacing = _decode(payload)
    height, width = rgb.shape[:2]
    # Keep a full-coordinate preview so references outside a segmentation crop remain editable.
    output = io.BytesIO()
    if include_preview:
        Image.fromarray(rgb).save(output, format='PNG')
    response = {
        'version': 1, 'source_sha256': hashlib.sha256(payload).hexdigest(),
        'image_png': base64.b64encode(output.getvalue()).decode('ascii'),
        'width': width, 'height': height, 'coordinate_space': 'original_image',
        'spacing': spacing, 'candidates': [], 'selected_index': None,
        'status': 'dicom' if spacing else 'not_found',
        'message': 'Using DICOM pixel spacing.' if spacing else 'No reference found. Draw a reference and enter its length.',
    }
    reused = _cached_result(cached, response)
    if reused is not None:
        return reused
    if preview_only:
        return response
    if spacing:
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
                'ocr_support': label.get('ocr_support'), 'ocr_alternatives': label.get('ocr_alternatives', []),
                'pairing_score': label.get('pairing_score'), 'pairing_margin': label.get('pairing_margin'),
                'geometry_confidence': ruler.get('geometry_confidence'),
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
