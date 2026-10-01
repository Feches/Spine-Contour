"""Run all lumbar and cervical ONNX graphs in the frozen executable."""
from pathlib import Path
import json
import subprocess
import sys

bundle = Path('backend-dist/spine-contour-backend')
executable = bundle / ('spine-contour-backend.exe' if sys.platform == 'win32' else 'spine-contour-backend')
result = subprocess.run([str(executable.resolve()), '--verify-models'], capture_output=True, text=True, timeout=240)
if result.returncode:
    raise RuntimeError(f'Bundled model verification failed:\n{result.stdout}\n{result.stderr}')
report = json.loads(result.stdout.strip().splitlines()[-1])
assert report['gpu_parity']['tolerance']['rtol'] == 2e-3
assert report['gpu_parity']['tolerance']['atol'] == 2e-3
assert report['gpu_parity']['passed'], 'GPU parity verification failed'
assert {'s1', 'vertebra', 'femoral', 'hrnet', 'cervical_detr', 'cervical_hrnet', 'crop_detector'} <= set(report['verified'])
assert not list(bundle.rglob('*.pt')), 'Training checkpoints must not ship alongside ONNX models'
assert not list(bundle.rglob('*.safetensors')), 'Detector training weights must not ship alongside ONNX models'
assert not (bundle / '_internal' / 'torch').exists(), 'PyTorch must not ship in the runtime bundle'
if sys.platform == 'win32':
    # The Windows installer runs models on a GPU through DirectML (docs/gpu-processing.md).
    # The CPU-only wheel would still pass every check above, so check the build itself.
    assert 'DmlExecutionProvider' in report['available_providers'], 'The Windows bundle must use onnxruntime-directml'
    assert list(bundle.rglob('DirectML.dll')), 'DirectML.dll must ship beside ONNX Runtime'
    print('Bundled DirectML; GPUs on this machine:', report['gpus'])
print('Verified all bundled ONNX models:', report['verified'])
