"""Offline packaged-model verification; no images or extra server endpoints."""
import hashlib
import json
import sys

import numpy as np

from . import runtime
from .models import models


def verify():
    assert 'torch' not in sys.modules, 'Desktop inference unexpectedly imports PyTorch'
    results = {}
    with runtime.session(runtime.parse_options('low-memory', 1, False)):
        for kind in models.MODEL_NAMES:
            path = models.ONNX_DIRECTORY / f'{kind}.onnx'
            metadata = json.loads(path.with_suffix('.json').read_text())
            assert metadata['kind'] == kind and metadata['precision'] == 'float32'
            assert hashlib.sha256(path.read_bytes()).hexdigest() == metadata['onnx_sha256']
            shape = (1, 3 if kind == 's1' else 1, 768, 768)
            output = models._infer(kind, lambda session: session.run(None, {'image': np.zeros(shape, np.float32)}), None)
            assert all(np.isfinite(value).all() for value in output)
            if kind == 's1':
                assert output[0].ndim == 1 and output[1].shape == (len(output[0]), 2, 3)
            else:
                expected = {'vertebra': (1, 6, 768, 768), 'femoral': (1, 1, 768, 768), 'hrnet': (1, 22, 2)}[kind]
                assert output[0].shape == expected
            results[kind] = [list(value.shape) for value in output]
        models.release_models()
    # Exercise the production Apple provider configuration as well as CPU-only
    # low memory. Fallback remains valid and its actual providers are reported.
    if sys.platform == 'darwin':
        with runtime.session(runtime.parse_options('standard', 2, False)):
            models._infer('s1', lambda session: session.run(None, {'image': np.zeros((1, 3, 768, 768), np.float32)}), None)
            results['apple_s1_providers'] = runtime.providers()['s1']
            models.release_models()
    print(json.dumps({'runtime': 'onnxruntime', 'verified': results}), flush=True)


if __name__ == '__main__':
    verify()
