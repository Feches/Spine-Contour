"""Windows release gate: the DirectML wheel must preserve the CPU wheel's outputs.

Run after exporting the six ONNX graphs. The production environment is untouched:
install the CPU-only wheel in a temporary venv and replay identical saved feeds.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def capture(manifest, output):
    import numpy as np
    import onnxruntime as ort
    reports = {}
    for case in json.loads(Path(manifest).read_text()):
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.add_session_config_entry('session.intra_op.allow_spinning', '0')
        session = ort.InferenceSession(case['model'], sess_options=options,
                                       providers=['CPUExecutionProvider'], enable_fallback=0)
        with np.load(case['feed']) as saved:
            values = session.run(None, dict(saved))
        for i, value in enumerate(values): reports[f"{case['id']}_{i}"] = value
        del session
    np.savez(output, **reports)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--capture', nargs=2, metavar=('MANIFEST', 'OUTPUT'))
    args = parser.parse_args()
    if args.capture:
        capture(*args.capture)
        return
    if sys.platform != 'win32':
        raise SystemExit('This gate requires Windows and the DirectML wheel')
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    import numpy as np
    import onnxruntime as ort
    from backend.gpu_parity import probes
    from backend.models import models
    assert 'DmlExecutionProvider' in ort.get_available_providers()
    with tempfile.TemporaryDirectory(prefix='spine-cpu-wheels-') as directory:
        root = Path(directory)
        cases = []
        for kind in models.MODEL_NAMES:
            # Zero and production-preprocessed seeded noise; keep the same tensors
            # for both wheels rather than depending on preprocessing in the venv.
            for name, feeds in probes(kind):
                if name not in ('zeros', 'noise_preprocessed'): continue
                key = f'{kind}_{name}'
                feed = root / f'{key}.npz'
                np.savez(feed, **feeds)
                cases.append({'id': key, 'model': str((models.ONNX_DIRECTORY / f'{kind}.onnx').resolve()), 'feed': str(feed)})
        manifest = root / 'feeds.json'; manifest.write_text(json.dumps(cases))
        directml = root / 'directml.npz'; capture(manifest, directml)
        env = root / 'cpu-env'
        subprocess.run([sys.executable, '-m', 'venv', str(env)], check=True)
        python = env / 'Scripts' / 'python.exe'
        subprocess.run([str(python), '-m', 'pip', 'install', f'onnxruntime=={ort.__version__}', f'numpy=={np.__version__}'], check=True)
        cpu = root / 'cpu.npz'
        subprocess.run([str(python), str(Path(__file__).resolve()), '--capture', str(manifest), str(cpu)], check=True)
        with np.load(directml) as a, np.load(cpu) as b:
            assert a.files == b.files
            for name in a.files:
                assert a[name].dtype == b[name].dtype and np.isfinite(a[name]).all()
                assert np.array_equal(a[name], b[name]), f'CPU outputs differ between wheels: {name}'
        print(f'CPU providers are bit-identical across both wheels: {len(cases)} model/input cases')


if __name__ == '__main__':
    main()
