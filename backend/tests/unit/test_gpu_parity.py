import numpy as np
import pytest
from backend import gpu_parity as parity, processors, runtime


def test_tolerance_shape_dtype_nonfinite_and_empty():
    a = np.array([0., 1., -1.], np.float32)
    assert parity.compare(a, a + .001)['passed']
    failure = parity.compare(a, a + .1)
    assert not failure['passed'] and failure['violations'] == 3
    assert failure['worst_index'] == [0] and failure['tolerance_ratio'] > 1
    assert not parity.compare(a, a.astype(np.float64))['passed']
    assert not parity.compare(a, a[:1])['passed']
    assert not parity.compare(a, np.full_like(a, np.nan))['passed']
    assert parity.compare(a[:0], a[:0])['passed']
    assert not parity.outputs([a], [])['passed']


def test_no_gpu_passes_but_explicit_missing_gpu_fails(monkeypatch):
    monkeypatch.setattr(processors, 'available', lambda: [processors.CPU])
    assert parity.verify_all()['passed']
    report = parity.verify_all('gpu:10de:2786')
    assert not report['passed'] and report['gpus']['gpu:10de:2786']['status'] == 'gpu_failed'


def test_gate_caches_only_matching_hardware_driver_runtime_models(monkeypatch):
    gpu = processors.Processor('gpu:10de:2786', 'gpu', 'test GPU', 0)
    identity = dict(driver='1', runtime='1', models={'s1': 'hash1'}, adapter=0)
    calls = []
    monkeypatch.setattr(parity, 'fingerprint', lambda g: identity.copy())
    monkeypatch.setattr(parity, 'verify_gpu', lambda g: calls.append(g) or {'passed': True})
    monkeypatch.setattr(parity, '_VERDICTS', {})
    parity.ensure_verified(gpu); parity.ensure_verified(gpu)
    assert len(calls) == 1
    for key, value in [('driver', '2'), ('runtime', '2'), ('models', {'s1': 'hash2'}), ('adapter', 1)]:
        identity[key] = value
        parity.ensure_verified(gpu)
    assert len(calls) == 5
    identity['driver'] = None
    parity.ensure_verified(gpu); parity.ensure_verified(gpu)
    assert len(calls) == 7


def test_gate_rejects_and_caches_failed_parity(monkeypatch):
    gpu = processors.Processor('gpu:10de:2786', 'gpu', 'test GPU', 0)
    monkeypatch.setattr(parity, '_VERDICTS', {})
    monkeypatch.setattr(parity, 'fingerprint', lambda g: {'driver': '1'})
    calls = []
    monkeypatch.setattr(parity, 'verify_gpu', lambda g: calls.append(g) or {'passed': False})
    for _ in range(2):
        with pytest.raises(runtime.GpuFailure, match='parity checks'): parity.ensure_verified(gpu)
    assert len(calls) == 1


def test_probe_preprocessing_shapes():
    from backend.models import models
    for kind in models.MODEL_NAMES:
        feeds = list(parity.probes(kind))
        assert len(feeds) == (6 if kind == 'cervical_detr' else 4)
        assert all(np.isfinite(v).all() for _, feed in feeds for v in feed.values())
    detr = list(parity.probes('cervical_detr'))
    assert detr[-2][1]['pixel_values'].shape == (1, 3, 800, 1067)
    assert detr[-1][1]['pixel_values'].shape == (1, 3, 1067, 800)


# Ruling R7: the appearance encoder always runs on the CPU and is never GPU-qualified, so a missing
# embed.onnx or a DirectML miss on the encoder alone can never cost a GPU run its GPU.
def test_fingerprint_hashes_only_the_qualified_graphs(monkeypatch, tmp_path):
    from backend.models import models
    gpu = processors.Processor('gpu:10de:2786', 'gpu', 'test GPU', 0)
    structure = [kind for kind in models.MODEL_NAMES if kind != 'embed']
    for kind in structure:
        (tmp_path / f'{kind}.onnx').write_bytes(kind.encode())
    monkeypatch.setattr(models, 'ONNX_DIRECTORY', tmp_path)
    def no_driver(*args, **kwargs): raise OSError('no driver query in tests')
    monkeypatch.setattr(parity.subprocess, 'run', no_driver)
    assert sorted(parity.fingerprint(gpu)['models']) == sorted(structure)


def test_qualification_never_loads_the_appearance_encoder(monkeypatch, tmp_path):
    import json
    gpu = processors.Processor('gpu:10de:2786', 'gpu', 'test GPU', 0)
    monkeypatch.setattr(processors, 'resolve', lambda identity: (gpu, None))
    monkeypatch.setattr(parity, 'fingerprint', lambda g: {'driver': 'test'})
    monkeypatch.setattr(parity.models, 'MODEL_NAMES', {'hrnet': 'HRNet', 'embed': 'appearance embedding model'})
    monkeypatch.setattr(parity, 'probes', lambda kind: [('probe', {'image': np.zeros((1,), np.float32)})])
    sessions = []
    class Session:
        def run(self, names, feeds): return [np.zeros((1, 22, 2), np.float32)]
        def end_profiling(self):
            path = tmp_path / 'profile.json'
            path.write_text(json.dumps([{'args': {'provider': processors.DIRECTML}}]))
            return str(path)
    monkeypatch.setattr(parity, 'new_session', lambda kind, policy, gpu=False, profile=None: sessions.append(kind) or Session())
    result = parity.verify_gpu(gpu)
    assert sessions == ['hrnet'] * 3
    assert set(result['models']) == {'hrnet'} and result['passed']


def test_film_parity_never_replays_the_encoder_or_requires_it_on_the_gpu(monkeypatch, tmp_path):
    import json
    from pathlib import Path
    from backend import server
    from backend.models import models
    gpu = processors.Processor('gpu:10de:2786', 'gpu', 'test GPU', 0)
    monkeypatch.setattr(processors, 'resolve', lambda identity: (gpu, None))
    (tmp_path / 'film.png').write_bytes(b'not a radiograph')
    manifest = tmp_path / 'films.json'
    manifest.write_text(json.dumps([{'path': 'film.png', 'region': 'lumbar'}]))
    class Session:
        def run(self, names, feeds): return [np.zeros((1, 22, 2), np.float32)]
    replayed = []
    monkeypatch.setattr(parity, 'new_session', lambda kind, policy, gpu=False, profile=None: replayed.append(kind) or Session())
    def run_prediction(request):
        # One structure model and the encoder, each through InferenceModel.run as production runs them.
        for kind in ('hrnet', 'embed'):
            model = object.__new__(models.InferenceModel)
            model.path, model.session = Path(f'{kind}.onnx'), Session()
            model.run(None, {'image': np.zeros((1,), np.float32)})
        on_gpu = request['settings'].processor == gpu.id
        return {'geometry': {}, 'measurements': {}, 'calibration': None, 'qc': {'processing': {
            'processor': {'resolved': request['settings'].processor, 'note': None},
            'providers': {'hrnet': [processors.DIRECTML, 'CPUExecutionProvider'] if on_gpu else ['CPUExecutionProvider'],
                          'embed': ['CPUExecutionProvider']}}}}
    monkeypatch.setattr(server, 'run_prediction', run_prediction)
    [report] = parity.verify_films(manifest, gpu.id)
    assert replayed == ['hrnet']
    assert [feed['kind'] for feed in report['raw_feeds']] == ['hrnet']
    assert report['passed'] and all(run['gpu'] for run in report['runs'])


def test_decoded_landmarks_fail_even_when_relative_raw_tolerance_passes():
    a = np.full((1, 22, 2), 700, np.float32); b = a + .1
    assert parity.outputs([a], [b])['passed']
    assert not parity.decoded('hrnet', [a], [b], {})
    assert not parity.tree_close({'L1': [[0, 0]]}, {'L2': [[0, 0]]}, .25)
    assert not parity.tree_close({'angle': None}, {'angle': 0}, .1)


@pytest.mark.parametrize('failure', ['none', 'drift', 'cpu_fallback', 'no_gpu_nodes', 'exception', 'repeat'])
def test_qualification_never_accepts_drift_fallback_or_zero_placement(monkeypatch, tmp_path, failure):
    import json
    gpu = processors.Processor('gpu:10de:2786', 'gpu', 'test GPU', 0)
    monkeypatch.setattr(processors, 'resolve', lambda identity: (gpu, None))
    monkeypatch.setattr(parity, 'fingerprint', lambda g: {'driver': 'test'})
    monkeypatch.setattr(parity.models, 'MODEL_NAMES', {'hrnet': 'HRNet'})
    monkeypatch.setattr(parity, 'probes', lambda kind: [('probe', {'image': np.zeros((1,), np.float32)})])
    class Session:
        def __init__(self, candidate): self.candidate, self.calls = candidate, 0
        def run(self, names, feeds):
            self.calls += 1
            if self.candidate and failure == 'exception': raise RuntimeError('GPU failed')
            delta = .1 if self.candidate and (failure == 'drift' or failure == 'repeat' and self.calls == 2) else 0
            return [np.full((1, 22, 2), delta, np.float32)]
        def end_profiling(self):
            path = tmp_path / 'profile.json'
            path.write_text(json.dumps([{'args': {'provider': 'CPUExecutionProvider' if failure == 'no_gpu_nodes' else processors.DIRECTML}}]))
            return str(path)
    def new_session(kind, policy, gpu=False, profile=None):
        if gpu and failure == 'cpu_fallback': raise RuntimeError('DirectML was not registered')
        return Session(gpu)
    monkeypatch.setattr(parity, 'new_session', new_session)
    result = parity.verify_gpu(gpu)
    assert result['passed'] == (failure == 'none')
    if failure in ('cpu_fallback', 'no_gpu_nodes', 'exception'): assert result['status'] == 'gpu_failed'
    if failure in ('drift', 'repeat'): assert result['status'] == 'parity_failed'
