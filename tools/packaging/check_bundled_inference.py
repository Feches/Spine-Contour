"""Run all four ONNX graphs using the frozen executable and its bundled DLLs."""
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
assert {'s1', 'vertebra', 'femoral', 'hrnet'} <= set(report['verified'])
assert not list(bundle.rglob('*.pt')), 'Training checkpoints must not ship alongside ONNX models'
assert not (bundle / '_internal' / 'torch').exists(), 'PyTorch must not ship in the runtime bundle'
print('Verified all four bundled ONNX models:', report['verified'])
