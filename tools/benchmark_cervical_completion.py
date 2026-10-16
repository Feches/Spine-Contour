"""Measure cervical API output coverage on originals and mirrors, without manual orientation.

Run separately against each checkout with the same image directory. Output coverage
is not localization accuracy: no reference landmarks are supplied or scored.
"""
import argparse
import hashlib
import io
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app-root', type=Path, required=True)
    parser.add_argument('--images', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.app_root.resolve()))
    import numpy as np
    from PIL import Image, ImageOps
    from fastapi.testclient import TestClient
    from backend import server

    args.output.mkdir(parents=True, exist_ok=True)
    files = sorted(args.images.glob('*.png'))
    if not files:
        parser.error('No PNG radiographs found')
    result_path = args.output / 'results.jsonl'
    if result_path.exists():
        parser.error('Use a fresh output directory to preserve prior results')
    manifest = {
        'images': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
        'backend': {str(p.relative_to(args.app_root)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in (args.app_root / 'backend').rglob('*.py') if 'tests' not in p.parts},
        'models': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in (args.app_root / 'backend/onnx').glob('*.onnx')
                   if p.stem in ('cervical_hrnet', 'cervical_detr', 'cervical_anatomical_hrnet', 'orientation_classifier')},
        'region': 'cervical', 'orientation': 'automatic',
        'complete_definition': '11 noncollapsed in-bounds endplates and in-bounds C2 centroid',
    }
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    client = TestClient(server.app, raise_server_exceptions=False)
    for path in files:
        with Image.open(path) as source:
            original = source.convert('L')
        for mirrored in (False, True):
            image = ImageOps.mirror(original) if mirrored else original
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            response = client.post('/predict', data={
                'modality': 'xray', 'body_part': 'cervical', 'view': 'lateral',
                'processing_mode': 'low-memory', 'cpu_threads': '2',
            }, files={'file': (path.name, buffer.getvalue(), 'image/png')})
            row = {'image': path.name, 'mirrored': mirrored, 'http_status': response.status_code,
                   'any_landmarks': False, 'complete': False}
            result = response.json()
            if response.status_code == 200:
                geometry = result.get('geometry', {})
                pairs = [body.get(key) for body in geometry.get('vertebrae', {}).values()
                         for key in ('superior', 'inferior') if body.get(key) is not None]
                def inside(point):
                    return (len(point) == 2 and np.isfinite(point).all()
                            and 0 <= point[0] < image.width and 0 <= point[1] < image.height)
                valid = [p for p in pairs if len(p) == 2 and all(inside(x) for x in p)
                         and np.linalg.norm(np.asarray(p[0])-p[1]) > 0]
                centroid = geometry.get('c2_centroid')
                row.update(any_landmarks=bool(pairs), endplates=len(pairs),
                           in_bounds_endplates=len(valid),
                           complete=len(valid) == 11 and centroid is not None and inside(centroid),
                           geometry=geometry, qc=result.get('qc'))
            else:
                row['error'] = result
            with result_path.open('a') as handle:
                handle.write(json.dumps(row) + '\n')
            print(path.name, mirrored, row['http_status'], row['complete'], flush=True)


if __name__ == '__main__':
    main()
