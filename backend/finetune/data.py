"""Reviewed source-coordinate annotations and reproducible subject-level splits."""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

TARGETS = ('lumbar_landmarks', 'lumbar_segmentation', 'cervical_landmarks')


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def points_for(study, target):
    g = study['geometry']
    bodies = g.get('vertebrae', {})
    if target == 'cervical_landmarks':
        if g.get('anterior_side') not in ('left', 'right'):
            raise ValueError('Cervical annotations require an anterior side')
        order = [0, 1] if g['anterior_side'] == 'left' else [1, 0]
        def pair(level, plate):
            p = bodies.get(level, {}).get(plate) or [None, None]
            return [p[i] for i in order]
        values = pair('C2', 'inferior') + [g.get('c2_centroid')]
        for level in range(3, 8):
            values += pair(f'C{level}', 'superior') + pair(f'C{level}', 'inferior')
    else:
        values = []
        for level in range(1, 6):
            body = bodies.get(f'L{level}', {})
            values += (body.get('superior') or [None, None]) + (body.get('inferior') or [None, None])
        if target == 'lumbar_landmarks':
            values += g.get('s1_superior') or [None, None]
    result = np.array([p if p is not None else [np.nan, np.nan] for p in values], np.float32)
    if result.shape != (23 if target == 'cervical_landmarks' else 22 if target == 'lumbar_landmarks' else 20, 2):
        raise ValueError('Malformed landmark array')
    present = np.isfinite(result).all(1)
    if np.isinf(result).any() or np.any(np.isfinite(result).any(1) != present):
        raise ValueError('Invalid landmark coordinate')
    if not present.any():
        raise ValueError('No annotated landmarks')
    width, height = g['image_width'], g['image_height']
    if ((result[present] < 0) | (result[present] >= [width, height])).any():
        raise ValueError('Landmarks lie outside the source image')
    if target == 'lumbar_segmentation':
        if not present.all():
            raise ValueError('Polygon segmentation requires all four corners of L1–L5; missing bodies cannot be background')
        for corners in result.reshape(5, 4, 2):
            polygon = corners[[0, 1, 3, 2]]
            if not cv2.isContourConvex(polygon) or cv2.contourArea(polygon) < 4:
                raise ValueError('Lumbar corners must form non-crossing convex body polygons')
    return result


def split_subjects(records, seed=42):
    groups = sorted({r['subjectId'].strip() for r in records},
                    key=lambda s: hashlib.sha256(f'{seed}:{s}'.encode()).hexdigest())
    if len(groups) < 5:
        raise ValueError('Select at least five subjects with reviewed annotations and Subject IDs')
    count = max(1, len(groups) // 5)
    assignment = {s: 'test' if i < count else 'validation' if i < 2 * count else 'train'
                  for i, s in enumerate(groups)}
    return {r['id']: assignment[r['subjectId'].strip()] for r in records}


def decode_image(payload):
    try:
        with Image.open(io.BytesIO(payload)) as image:
            return np.array(image) if image.mode in ('I', 'F') or image.mode.startswith('I;16') else np.array(image.convert('L'))
    except (OSError, ValueError):
        import pydicom
        ds = pydicom.dcmread(io.BytesIO(payload))
        pixels = np.asarray(ds.pixel_array, np.float32)
        if pixels.ndim != 2:
            raise ValueError('Only single-frame grayscale images are supported')
        pixels = pixels * float(getattr(ds, 'RescaleSlope', 1)) + float(getattr(ds, 'RescaleIntercept', 0))
        if str(getattr(ds, 'PhotometricInterpretation', '')).upper() == 'MONOCHROME1':
            pixels = pixels.max() + pixels.min() - pixels
        return pixels


def crop_window(study, target):
    g, framing = study['geometry'], (study.get('qc') or {}).get('framing') or {}
    full = g.get('region') == 'full_spine'
    key = ('cervical_window' if target == 'cervical_landmarks' else 'lumbar_window') if full else 'window'
    window = framing.get(key)
    if not isinstance(window, (list, tuple)) or len(window) != 4 or not all(isinstance(v, (int, float)) and np.isfinite(v) and v == int(v) for v in window):
        raise ValueError('Reprocess the study to save its image-only model crop before training')
    l, t, r, b = map(int, window)
    # Single-region cervical records store x,y,width,height; other crops use x0,y0,x1,y1.
    if target == 'cervical_landmarks' and not full:
        r, b = l + r, t + b
    if not (0 <= l < r <= g['image_width'] and 0 <= t < b <= g['image_height']):
        raise ValueError('Invalid saved model crop')
    return l, t, r, b


def prepare(study, target, raw):
    from ..models.models import _robust_rescale, _letterbox, _segmentation_input
    from ..models.cervical import _rgb_tensor
    points = points_for(study, target)
    l, t, r, b = crop_window(study, target)
    valid = np.isfinite(points).all(1)
    if ((points[valid] < [l, t]) | (points[valid] >= [r, b])).any():
        raise ValueError('Corrected landmarks lie outside the saved model crop; reprocess with a wider crop')
    if target == 'cervical_landmarks' and raw.dtype != np.uint8:
        if study['geometry'].get('region') == 'full_spine':
            raise ValueError('Cervical training on full-spine images requires an 8-bit source; the original search-window intensity transform was not saved')
        raw = _robust_rescale(raw)
    crop = raw[t:b, l:r].copy()
    points -= [l, t]
    # Full-spine inference canonicalizes to anterior=image left before both heads.
    mirrored = study['geometry'].get('region') == 'full_spine' and bool((study.get('qc') or {}).get('framing', {}).get('canonical_mirror'))
    if mirrored:
        crop = crop[:, ::-1].copy()
        points[:, 0] = (r-l-1) - points[:, 0]
        if target == 'cervical_landmarks':
            # Cervical slots are image-left/right, unlike anatomical lumbar slots.
            swaps = [(0, 1)] + [(i, i+1) for i in range(3, 23, 2)]
            for i, j in swaps:
                points[[i, j]] = points[[j, i]]
                valid[[i, j]] = valid[[j, i]]
    if target == 'cervical_landmarks':
        crop = crop if crop.dtype == np.uint8 else _robust_rescale(crop)
        display = np.asarray(Image.fromarray(crop).resize((384, 384), Image.Resampling.BILINEAR))
        value = _rgb_tensor(display)[0]
        points *= [384 / (r-l), 384 / (b-t)]
        native_scale = np.array([(r-l)/384, (b-t)/384], np.float32)
    else:
        display, tr = _letterbox(_robust_rescale(crop))
        value = _segmentation_input(display)[0]
        points = points * tr.scale + [tr.left, tr.top]
        native_scale = np.array([1/tr.scale, 1/tr.scale], np.float32)
    mask = np.zeros(display.shape, np.uint8)
    if target == 'lumbar_segmentation':
        for label, corners in enumerate(points.reshape(5, 4, 2), 1):
            body = np.zeros_like(mask)
            cv2.fillConvexPoly(body, np.rint(corners[[0, 1, 3, 2]]).astype(np.int32), 1)
            if not body.any() or (mask[body > 0] > 0).any():
                raise ValueError('Body polygons overlap or disappear at model resolution')
            mask[body > 0] = label
    return value, np.nan_to_num(points).astype(np.float32), valid, mask, native_scale, display


def snapshot(studies, target, output, report):
    if target not in TARGETS:
        raise ValueError('Unknown training target')
    if not isinstance(studies, list) or not studies or len(studies) > 10000:
        raise ValueError('Select 1–10000 reviewed studies')
    ids, hashes, pixel_hashes, records = set(), set(), set(), []
    cache = output / 'data'
    cache.mkdir()
    for index, study in enumerate(studies):
        report(stage='preparing', completed=index, total=len(studies), message='Checking and snapshotting reviewed annotations')
        if study.get('source') != 'real' or not study.get('reviewedAt') or study.get('processingError'):
            raise ValueError('Only reviewed real studies without processing errors can be trained')
        if not isinstance(study.get('subjectId'), str) or not study['subjectId'].strip():
            raise ValueError('Every training study needs a Subject ID to prevent split leakage')
        if study.get('id') in ids:
            raise ValueError('Duplicate study selected')
        ids.add(study['id'])
        g = study.get('geometry') or {}
        region = g.get('region', 'lumbar')
        if region not in (('cervical', 'full_spine') if target == 'cervical_landmarks' else ('lumbar', 'full_spine')):
            raise ValueError('Study region does not match training target')
        if g.get('coordinate_space') != 'original_image':
            raise ValueError('Training requires source-image coordinates; reprocess this study')
        image = Path(study['filePath'])
        if not image.is_file() or image.stat().st_size > 50 * 1024 * 1024:
            raise ValueError('Source image is missing or exceeds 50 MB')
        payload = image.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        if digest != g.get('source_sha256'):
            raise ValueError('Source image changed since annotation; reprocess and review it')
        raw = decode_image(payload)
        if raw.shape != (g.get('image_height'), g.get('image_width')):
            raise ValueError('Source image dimensions do not match annotations')
        pixel_digest = hashlib.sha256(str(raw.shape).encode() + raw.astype(np.float32).tobytes()).hexdigest()
        if digest in hashes or pixel_digest in pixel_hashes:
            raise ValueError('Duplicate images selected; keep one reviewed record per image')
        hashes.add(digest)
        pixel_hashes.add(pixel_digest)
        value, points, valid, mask, scale, display = prepare(study, target, raw)
        stem = f'{index:05d}'
        np.savez_compressed(cache / f'{stem}.npz', image=value, points=points, valid=valid, mask=mask, scale=scale, display=display)
        preview = cv2.cvtColor(display, cv2.COLOR_GRAY2RGB)
        if target == 'lumbar_segmentation':
            preview[mask > 0] = (.6 * preview[mask > 0] + .4 * np.array([30, 210, 140])).astype(np.uint8)
        for x, y in points[valid]:
            cv2.circle(preview, (round(float(x)), round(float(y))), 3, (255, 70, 40), -1)
        Image.fromarray(preview).save(cache / f'{stem}-target.png')
        records.append({'id': study['id'], 'subjectId': study['subjectId'].strip(), 'cache': f'data/{stem}.npz',
                        'source_sha256': digest, 'pixel_sha256': pixel_digest,
                        'geometry': g, 'framing': (study.get('qc') or {}).get('framing'), 'reviewedAt': study['reviewedAt']})
    split = split_subjects(records)
    for row in records:
        row['split'] = split[row['id']]
    (output / 'dataset.json').write_text(json.dumps({'target': target, 'seed': 42, 'records': records}, indent=2))
    return records
