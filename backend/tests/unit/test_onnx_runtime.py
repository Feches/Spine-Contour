import subprocess
import sys
import json
from functools import lru_cache

import numpy as np
import onnxruntime as ort
import pytest

from backend import runtime
from backend.models import models
from backend.models.hrnet import LANDMARKS


def test_server_import_does_not_load_training_libraries():
    subprocess.run([sys.executable, '-c',
        "import sys; from backend import server; "
        "assert not {'torch','torchvision','timm','segmentation_models_pytorch'} & sys.modules.keys()"], check=True)


def test_runtime_landmark_order_matches_training_checkpoint_contract():
    assert models.HRNET_LANDMARKS == LANDMARKS


def test_onnx_session_policy_limits_threads_and_disables_idle_spinning():
    low = models.session_options((1, True))
    standard = models.session_options((4, False))
    assert low.intra_op_num_threads == 1 and standard.intra_op_num_threads == 4
    assert low.inter_op_num_threads == standard.inter_op_num_threads == 1
    assert low.execution_mode == ort.ExecutionMode.ORT_SEQUENTIAL
    assert not low.enable_mem_pattern and not low.enable_cpu_mem_arena
    assert standard.enable_mem_pattern and standard.enable_cpu_mem_arena
    assert low.get_session_config_entry('session.intra_op.allow_spinning') == '0'


def test_missing_converted_model_fails_with_actionable_message(monkeypatch, tmp_path):
    models.release_models()
    monkeypatch.setattr(models, 'ONNX_DIRECTORY', tmp_path)
    with pytest.raises(FileNotFoundError, match='tools/export_onnx.py'):
        models._load_model('s1', (1, True))


def test_sessions_are_reused_with_same_policy_and_replaced_when_settings_change(monkeypatch):
    loaded = []
    class Model:
        def get_providers(self): return ['CPUExecutionProvider']
    @lru_cache(maxsize=4)
    def load(kind, policy):
        loaded.append((kind, policy))
        return Model()
    models.release_models()
    monkeypatch.setattr(models, '_load_model', load)
    for mode, threads in [('standard', 2), ('standard', 2), ('low-memory', 1), ('low-memory', 2)]:
        with runtime.session(runtime.parse_options(mode, threads)):
            models._infer('s1', lambda model: None, None)
    assert len(loaded) == 3
    assert loaded[-2:] == [('s1', (1, True)), ('s1', (2, True))]
    models.release_models()


def test_onnx_detection_adapter_handles_empty_nonfinite_and_valid_outputs():
    assert models._s1_from_output({'scores': np.empty(0), 'keypoints': np.empty((0, 2, 3))}) == (0, None)
    confidence, points = models._s1_from_output({'scores': np.array([.1, .9]),
        'keypoints': np.array([[[1, 2, 1], [3, 4, 1]], [[10, 20, 1], [30, 40, 1]]])})
    assert confidence == .9
    np.testing.assert_array_equal(points, [[10, 20], [30, 40]])
    assert models._s1_from_output({'scores': np.array([np.nan]),
        'keypoints': np.zeros((1, 2, 3))}) == (0, None)


@pytest.mark.parametrize('failure', ['compile', 'run'])
def test_apple_failure_falls_back_once_and_records_actual_cpu_provider(monkeypatch, tmp_path, failure):
    calls = []
    class Session:
        def __init__(self, *args, providers, **kwargs):
            self.providers = [p[0] if isinstance(p, tuple) else p for p in providers]
            calls.append(self.providers)
            if failure == 'compile' and len(providers) > 1: raise RuntimeError('Apple compiler unavailable')
        def get_providers(self): return self.providers
        def run(self, *args):
            if len(self.providers) > 1: raise ort.capi.onnxruntime_pybind11_state.Fail('Unsupported partition')
            return [np.zeros((0,)), np.zeros((0, 2, 3))]
    monkeypatch.setattr(ort, 'InferenceSession', Session)
    model = models.InferenceModel(tmp_path / 's1.onnx', (4, False),
                                 ['CoreMLExecutionProvider', 'CPUExecutionProvider'])
    for _ in range(2):
        assert model.run(None, {})[1].shape == (0, 2, 3)
    assert model.get_providers() == ['CPUExecutionProvider']
    assert calls == [['CoreMLExecutionProvider', 'CPUExecutionProvider'], ['CPUExecutionProvider']]


def test_apple_cache_is_bound_to_graph_hash_and_disabled_for_low_memory(monkeypatch, tmp_path):
    path = tmp_path / 's1.onnx'
    path.write_bytes(b'graph')
    path.with_suffix('.json').write_text(json.dumps({'onnx_sha256': 'firsthash'}))
    monkeypatch.setattr(models, 'ONNX_DIRECTORY', tmp_path)
    monkeypatch.setattr(models.sys, 'platform', 'darwin')
    monkeypatch.delenv('SPINE_CONTOUR_ORT_CPU_ONLY', raising=False)
    monkeypatch.setenv('SPINE_CONTOUR_MODEL_CACHE', str(tmp_path / 'cache'))
    monkeypatch.setattr(ort, 'get_available_providers', lambda: ['CoreMLExecutionProvider', 'CPUExecutionProvider'])
    observed = []
    monkeypatch.setattr(models, 'InferenceModel', lambda path, policy, providers: observed.append(providers))
    for digest in ['firsthash', 'changedhash']:
        path.with_suffix('.json').write_text(json.dumps({'onnx_sha256': digest}))
        models.release_models()
        models._load_model('s1', (4, False))
    models._load_model('s1', (2, True))
    for digest, providers in zip(['firsthash', 'changedhash'], observed):
        name, options = providers[0]
        assert name == 'CoreMLExecutionProvider'
        assert digest in options['ModelCacheDirectory']
        assert options['MLComputeUnits'] == 'CPUOnly'
        assert options['RequireStaticInputShapes'] == '1'
    assert observed[-1] == ['CPUExecutionProvider']
    models.release_models()
