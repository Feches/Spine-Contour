"""Compare fresh CPU workers on real local files (macOS/Linux development tool).

python tools/benchmark_processing.py --output /tmp/processing-benchmark.json image.webp ...
Each mode/image gets its own process, so peak resident memory is comparable.
The JSON contains local measurements; do not upload it or the source images.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]



def worker(image, mode, threads, model, localizer=True, reference=None):
    import resource
    sys.path.insert(0, str(Path(reference) if reference else ROOT))
    from backend import runtime, server, framing
    from backend.models import models
    if reference:
        import torch
        torch.set_num_threads(threads)
        models._segmentation_device = lambda: 'cpu'
        models._detection_device = lambda: 'cpu'
        settings = runtime.parse_options(mode, 2)
        if not localizer:
            # Reproduce the new OFF path with the unchanged reference models.
            framing.locate = lambda raw, scorer: {
                'window': framing.fallback_window(raw), 'searched': False,
                'whole_film_won': True, 'whole_film_cost': None,
                'confidence': None, 'cost': None, 'candidates': 0}
    else:
        settings = runtime.parse_options(mode, 2, localizer)
    started = time.monotonic()
    stages = []
    def progress(event):
        stages.append({**event, 'seconds': round(time.monotonic() - started, 3)})
    result = server.run_prediction({
        'settings': settings, 'payload': Path(image).read_bytes(),
        'modality': 'xray', 'body_part': 'lumbar', 'view': 'lateral', 'laterality': None,
        'vertebra_model': model, 'femoral_model': None, 's1_model': None, 'calibration': None,
    }, progress)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    peak_mb = peak / (1024 * 1024 if sys.platform == 'darwin' else 1024)
    return {'image': str(image), 'mode': mode, 'model': model, 'device': 'cpu', 'standard_threads': threads,
            'runtime': 'pytorch' if reference else 'onnxruntime', 'crop_localizer': localizer,
            'inference_seconds': next((s['seconds'] for s in stages if s['stage'] == 'landmarks'), None),
            'elapsed_seconds': round(time.monotonic() - started, 2), 'peak_rss_mb': round(peak_mb, 1),
            'geometry': result['geometry'], 'measurements': result['measurements'], 'qc': result['qc'],
            'calibration': result['calibration'], 'stages': stages,
            'image_hashes': {key: hashlib.sha256(result[key].encode()).hexdigest()
                             for key in ('image_png', 'mask_png', 'femoral_mask_png')}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('images', nargs='+')
    parser.add_argument('--worker', choices=['standard', 'low-memory'])
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--model', choices=['unet', 'hrnet'], default='unet')
    parser.add_argument('--modes', nargs='+', choices=['standard', 'low-memory'], default=['standard', 'low-memory'])
    parser.add_argument('--output', default='/tmp/spine-processing-benchmark.json')
    parser.add_argument('--localizer', choices=['on', 'off'], default='on')
    parser.add_argument('--reference-repo', help='Compare an unchanged PyTorch worktree in fresh workers')
    args = parser.parse_args()
    if args.worker:
        print(json.dumps(worker(args.images[0], args.worker, args.threads, args.model, args.localizer == 'on', args.reference_repo), allow_nan=False))
        return
    results = []
    for image in args.images:
        for mode in args.modes:
            print(f'Benchmarking {Path(image).name}: {mode}, CPU', flush=True)
            run = subprocess.run([sys.executable, __file__, '--worker', mode, '--threads', str(args.threads), '--model', args.model, '--localizer', args.localizer,
                                  *(['--reference-repo', args.reference_repo] if args.reference_repo else []), image],
                                 cwd=ROOT, capture_output=True, text=True, check=True)
            result = json.loads(run.stdout)
            results.append(result)
            Path(args.output).write_text(json.dumps(results, indent=2, allow_nan=False))
            print(json.dumps({key: result[key] for key in ['mode', 'elapsed_seconds', 'peak_rss_mb']}), flush=True)


if __name__ == '__main__':
    main()
