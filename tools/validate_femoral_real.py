"""Run the complete prediction path on explicitly supplied, real radiographs.

The manifest is a local JSON list of {path, region, anterior_side?, expect_heads?}.
Images, predictions and overlays remain in the selected local output directory.
No synthetic inputs, substituted landmarks or mocked model sessions are used.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from backend import runtime, server


def validate_case(case, output):
    source = Path(case['path']).expanduser().resolve()
    payload = source.read_bytes()
    region = case.get('region', 'lumbar')
    if region not in ('lumbar', 'full_spine', 'auto'):
        raise ValueError('Use lumbar, full_spine or auto for femoral validation')
    started = time.monotonic()
    result = server.run_prediction({
        'settings': runtime.parse_options('standard', 2, True),
        'payload': payload, 'modality': 'xray', 'body_part': region,
        'view': 'lateral', 'laterality': None,
        'vertebra_model': {'lumbar': 'unet', 'full_spine': 'dual_hrnet', 'auto': None}[region],
        'femoral_model': None, 's1_model': None, 'calibration': None,
        'anterior_side': case.get('anterior_side'),
    })
    output.mkdir(parents=True, exist_ok=True)
    (output / 'prediction.json').write_text(json.dumps(result))
    for field in ('image_png', 'femoral_mask_png'):
        encoded = result[field].split(',')[-1]
        (output / f'{field}.png').write_bytes(base64.b64decode(encoded))
    image = cv2.imread(str(output / 'image_png.png'))
    mask = cv2.imread(str(output / 'femoral_mask_png.png'), cv2.IMREAD_GRAYSCALE)
    circles = result['geometry'].get('femoral_circles', [])
    if mask.shape != image.shape[:2]:
        raise AssertionError('Femoral mask does not match source image dimensions')
    overlay = image.copy()
    overlay[mask > 0] = (overlay[mask > 0] * .65 + np.array([0, 255, 0]) * .35).astype(np.uint8)
    for circle in circles:
        if len(circle) != 3 or not np.isfinite(circle).all() or circle[2] <= 0:
            raise AssertionError('Invalid femoral circle')
        x, y, radius = circle
        cv2.circle(overlay, (round(x), round(y)), round(radius), (0, 220, 255), max(2, image.shape[0] // 700))
    scale = min(1, 1400 / image.shape[0])
    cv2.imwrite(str(output / 'overlay.jpg'), cv2.resize(overlay, None, fx=scale, fy=scale))
    expected = case.get('expect_heads')
    passed = expected is None or bool(circles) == expected
    return {'source': str(source), 'sha256': hashlib.sha256(payload).hexdigest(),
            'region': region, 'elapsed_seconds': round(time.monotonic() - started, 2),
            'source_size': list(image.shape[:2]), 'foreground_pixels': int((mask > 0).sum()),
            'circles': circles, 'femoral_qc': result['qc'].get('femoral'),
            'framing': result['qc'].get('framing'),
            'measurements': {key: result['measurements'].get(key) for key in ('PI', 'PT', 'SS', 'L1PA')},
            'expect_heads': expected, 'passed': passed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    cases = json.loads(args.manifest.read_text())
    if not isinstance(cases, list) or not cases:
        parser.error('Manifest must contain at least one real-image case')
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for index, case in enumerate(cases):
        print(f"Running real image {index + 1}/{len(cases)}: {Path(case['path']).name}", flush=True)
        try:
            row = validate_case(case, args.output / f'case-{index + 1:02d}')
        except Exception as error:
            row = {'source': case['path'], 'passed': False, 'error': str(error)}
        results.append(row)
        (args.output / 'results.json').write_text(json.dumps(results, indent=2))
        print(json.dumps(row), flush=True)
    return 0 if all(row['passed'] for row in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
