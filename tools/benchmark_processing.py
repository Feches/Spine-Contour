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
sys.path.insert(0, str(ROOT))


def worker(image, mode, threads, model):
    import resource
    import torch
    from backend import runtime, server
    from backend.models import models
    models._segmentation_device = lambda: 'cpu'
    models._detection_device = lambda: 'cpu'
    # Both runs start with the same standard thread count. Low-memory applies
    # its own two-thread cap, and restores the original count on completion.
    torch.set_num_threads(threads)
    started = time.monotonic()
    stages = []
    def progress(event):
        stages.append({**event, 'seconds': round(time.monotonic() - started, 3)})
    result = server.run_prediction({
        'settings': runtime.parse_options(mode, 2), 'payload': Path(image).read_bytes(),
        'modality': 'xray', 'body_part': 'lumbar', 'view': 'lateral', 'laterality': None,
        'vertebra_model': model, 'femoral_model': None, 's1_model': None, 'calibration': None,
    }, progress)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    peak_mb = peak / (1024 * 1024 if sys.platform == 'darwin' else 1024)
    return {'image': str(image), 'mode': mode, 'model': model, 'device': 'cpu', 'standard_threads': threads,
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
    parser.add_argument('--output', default='/tmp/spine-processing-benchmark.json')
    args = parser.parse_args()
    if args.worker:
        print(json.dumps(worker(args.images[0], args.worker, args.threads, args.model), allow_nan=False))
        return
    results = []
    for image in args.images:
        for mode in ['standard', 'low-memory']:
            print(f'Benchmarking {Path(image).name}: {mode}, CPU', flush=True)
            run = subprocess.run([sys.executable, __file__, '--worker', mode, '--threads', str(args.threads), '--model', args.model, image],
                                 cwd=ROOT, capture_output=True, text=True, check=True)
            result = json.loads(run.stdout)
            results.append(result)
            Path(args.output).write_text(json.dumps(results, indent=2, allow_nan=False))
            print(json.dumps({key: result[key] for key in ['mode', 'elapsed_seconds', 'peak_rss_mb']}), flush=True)


if __name__ == '__main__':
    main()
