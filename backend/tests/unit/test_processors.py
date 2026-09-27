"""GPU choice: the offered list, per-request resolution, DirectML sessions and CPU fallback.

CI runners have no GPU, so DirectML devices and sessions are fakes shaped like
ONNX Runtime 1.24's `OrtEpDevice`/`InferenceSession`. The real GPU path is
checked by `--verify-models` on a workstation (docs/gpu-processing.md).
"""
import ctypes
from functools import lru_cache
import logging

import numpy as np
import onnxruntime as ort
import pytest
from fastapi.testclient import TestClient

from backend import processors, runtime, server
from backend.models import models


class Hardware:
    def __init__(self, vendor_id, device_id, metadata, kind=ort.OrtHardwareDeviceType.GPU, vendor='NVIDIA'):
        self.vendor_id, self.device_id, self.metadata, self.type, self.vendor = vendor_id, device_id, metadata, kind, vendor


class EpDevice:
    def __init__(self, hardware, ep_name=processors.DIRECTML):
        self.ep_name, self.device = ep_name, hardware
        self.ep_options = {'device_id': hardware.metadata.get('DxgiAdapterNumber', '0')}


def gpu(adapter, vendor_id=0x10de, device_id=0x2520, name='NVIDIA GeForce RTX 3060 Laptop GPU', memory='6144 MB'):
    return EpDevice(Hardware(vendor_id, device_id, {'Description': name, 'DxgiAdapterNumber': str(adapter),
                                                    'DxgiVideoMemory': memory}))


@pytest.fixture
def devices(monkeypatch):
    listed = []
    monkeypatch.setattr(ort, 'get_ep_devices', lambda: listed)
    # Windows' current adapter list agrees with ONNX Runtime's startup list unless a test changes it.
    monkeypatch.setattr(processors, '_dxgi_adapters', lambda: [
        (int(d.device.metadata['DxgiAdapterNumber']), d.device.vendor_id, d.device.device_id)
        for d in listed if d.ep_name == processors.DIRECTML and 'DxgiAdapterNumber' in d.device.metadata])
    return listed


def test_cpu_is_always_offered_first_and_gpus_follow_windows_adapter_order(devices):
    devices += [
        gpu(2, 0x1002, 0x73df, 'AMD Radeon RX 6700 XT', '12272 MB'),
        EpDevice(Hardware(0x8086, 0x9a49, {}, ort.OrtHardwareDeviceType.CPU, 'Intel'), 'CPUExecutionProvider'),
        gpu(0, 0x8086, 0x9a49, 'Intel(R) Iris(R)  Xe Graphics ', '128 MB'),
        gpu(1),
    ]
    offered = processors.available()
    assert [p.public() for p in offered] == [
        {'id': 'cpu', 'kind': 'cpu', 'name': 'CPU', 'memory_mb': None},
        {'id': 'gpu:8086:9a49', 'kind': 'gpu', 'name': 'Intel(R) Iris(R) Xe Graphics', 'memory_mb': 128},
        {'id': 'gpu:10de:2520', 'kind': 'gpu', 'name': 'NVIDIA GeForce RTX 3060 Laptop GPU', 'memory_mb': 6144},
        {'id': 'gpu:1002:73df', 'kind': 'gpu', 'name': 'AMD Radeon RX 6700 XT', 'memory_mb': 12272},
    ]
    assert [p.adapter for p in offered] == [None, 0, 1, 2]


def test_identical_cards_get_ordinals_and_unaddressable_devices_are_not_offered(devices):
    devices += [
        gpu(3), gpu(1),
        # Without DxgiAdapterNumber DirectML would silently use adapter 0: a different GPU.
        EpDevice(Hardware(0x10de, 0x2684, {'Description': 'NVIDIA GeForce RTX 4090'})),
        EpDevice(Hardware(0x10de, 0x2684, {'DxgiAdapterNumber': '4'}, ort.OrtHardwareDeviceType.NPU)),
        EpDevice(Hardware(0x10de, 0x2684, {'DxgiAdapterNumber': '5'}), 'WebGpuExecutionProvider'),
        EpDevice(Hardware(0x1234, 0x5678, {'DxgiAdapterNumber': '6'}, vendor='')),
        EpDevice(Hardware(0x1002, 0x1638, {'DxgiAdapterNumber': '7'}, vendor='AMD')),
    ]
    offered = processors.available()
    assert [(p.id, p.adapter) for p in offered] == [
        ('cpu', None), ('gpu:10de:2520', 1), ('gpu:10de:2520:2', 3), ('gpu:1234:5678', 6), ('gpu:1002:1638', 7)]
    assert [p.name for p in offered[-2:]] == ['GPU', 'AMD GPU'] and offered[-1].memory_mb is None
    assert all(processors.valid(p.id) for p in offered)


def test_a_runtime_without_device_discovery_offers_only_the_cpu(monkeypatch):
    def missing():
        raise RuntimeError('OrtEpDevices are not supported in this build')
    monkeypatch.setattr(ort, 'get_ep_devices', missing)
    assert processors.available() == [processors.CPU]


@pytest.mark.parametrize('value', ['cpu', 'gpu:10de:2520', 'gpu:10de:2520:2', 'gpu:10de:2520:12', 'gpu:4d4f4351:36334330'])
def test_valid_processor_ids(value):
    assert processors.valid(value)
    assert runtime.parse_options(processor=value).processor == value


@pytest.mark.parametrize('value', ['', 'gpu', 'GPU', 'CPU', 'gpu:10DE:2520', 'gpu:10de:2520:1', 'gpu:10de:2520:0',
                                   'gpu:10de:252', 'dml:0', '0', 0, None, True])
def test_invalid_processor_ids_are_rejected(value):
    assert not processors.valid(value)
    with pytest.raises(ValueError): runtime.parse_options(processor=value)


def test_request_resolves_its_gpu_by_identity_and_restores_the_cpu_afterwards(devices):
    devices += [gpu(0, 0x8086, 0x9a49, 'Intel(R) UHD Graphics'), gpu(1)]
    events = []
    assert runtime.parse_options().processor == 'cpu'
    with runtime.session(runtime.parse_options(processor='gpu:10de:2520'), events.append):
        assert runtime.processor().adapter == 1
        assert runtime.processor_record() == {'requested': 'gpu:10de:2520', 'resolved': 'gpu:10de:2520',
                                              'name': 'NVIDIA GeForce RTX 3060 Laptop GPU', 'note': None}
    assert all(e['stage'] != 'processor' for e in events)
    assert runtime.processor() is processors.CPU


def test_windows_reordering_adapters_while_the_app_is_open_keeps_the_chosen_card(monkeypatch, devices):
    # ONNX Runtime read Intel=0, NVIDIA=1 at startup and never reads again; DirectML would
    # open whatever sits at index 1 now. A display moved to the NVIDIA card: it is 0.
    devices += [gpu(0, 0x8086, 0x9a49, 'Intel(R) UHD Graphics'), gpu(1)]
    monkeypatch.setattr(processors, '_dxgi_adapters', lambda: [(0, 0x10de, 0x2520), (1, 0x8086, 0x9a49)])
    with runtime.session(runtime.parse_options(processor='gpu:10de:2520')):
        assert runtime.processor().adapter == 0
        assert runtime.processor().name == 'NVIDIA GeForce RTX 3060 Laptop GPU'
    with runtime.session(runtime.parse_options(processor='gpu:8086:9a49')):
        assert runtime.processor().adapter == 1


def test_a_gpu_removed_while_the_app_is_open_is_not_found(monkeypatch, devices):
    devices += [gpu(0, 0x8086, 0x9a49, 'Intel(R) UHD Graphics'), gpu(1)]
    monkeypatch.setattr(processors, '_dxgi_adapters', lambda: [(0, 0x8086, 0x9a49)])
    events = []
    with runtime.session(runtime.parse_options(processor='gpu:10de:2520'), events.append):
        assert runtime.processor() is processors.CPU
        assert runtime.processor_record()['note'] == processors.NOT_FOUND
    assert [e['message'] for e in events if e['stage'] == 'processor'] == [processors.NOT_FOUND]


def test_if_windows_adapters_cannot_be_listed_the_startup_order_is_used_and_logged(monkeypatch, devices, caplog):
    devices += [gpu(0, 0x8086, 0x9a49, 'Intel(R) UHD Graphics'), gpu(1)]
    def broken():
        raise OSError('CreateDXGIFactory2 failed (0x887a0004)')
    monkeypatch.setattr(processors, '_dxgi_adapters', broken)
    with caplog.at_level(logging.WARNING, logger=processors.__name__):
        chosen, note = processors.resolve('gpu:10de:2520')
    assert (chosen.adapter, note) == (1, None)
    assert 'Could not list Windows graphics adapters' in caplog.text


class Com:
    """COM-shaped test objects: an object whose first field points to a vtable of C callbacks."""
    def __init__(self):
        self.keep, self.released = [], []
    def make(self, methods):
        vtable = (ctypes.c_void_p * 16)()
        methods = {processors._RELEASE: ((), lambda this: self.released.append(this) or 0), **methods}
        for slot, (argtypes, function) in methods.items():
            callback = ctypes.CFUNCTYPE(processors._HRESULT, ctypes.c_void_p, *argtypes)(function)
            vtable[slot] = ctypes.cast(callback, ctypes.c_void_p).value
            self.keep.append(callback)
        instance = ctypes.c_void_p(ctypes.addressof(vtable))
        self.keep += [vtable, instance]
        return ctypes.addressof(instance)
    def adapter(self, vendor, device, flags=0, result=0):
        def get_desc1(this, desc):
            desc[0].VendorId, desc[0].DeviceId, desc[0].Flags = vendor, device, flags
            return result
        return self.make({processors._GET_DESC1: ((ctypes.POINTER(processors._AdapterDesc1),), get_desc1)})
    def factory(self, adapters, failing_index=None):
        def enum_adapters1(this, index, out):
            if index == failing_index:
                return 0x80004005 - (1 << 32)  # E_FAIL
            if index >= len(adapters):
                return processors._DXGI_ERROR_NOT_FOUND
            out[0] = adapters[index]
            return 0
        return self.make({processors._ENUM_ADAPTERS1: ((ctypes.c_uint32, ctypes.POINTER(ctypes.c_void_p)), enum_adapters1)})


def test_dxgi_layout_matches_windows_x64():
    desc = processors._AdapterDesc1
    assert ctypes.sizeof(desc) == 312
    assert [getattr(desc, name).offset for name in ('VendorId', 'DeviceId', 'DedicatedVideoMemory',
            'AdapterLuidLowPart', 'Flags')] == [256, 260, 272, 296, 304]
    assert processors._IID_IDXGI_FACTORY1.hex() == '78ae0a776ff2ba4da829253c83d1b387'


def test_windows_adapters_are_read_in_directml_order_and_every_object_is_released():
    com, calls = Com(), []
    adapters = [com.adapter(0x8086, 0x9a49), com.adapter(0x1414, 0x008c, flags=2),
                com.adapter(0x10de, 0x2520), com.adapter(0x10de, 0x2520, flags=1)]
    factory = com.factory(adapters)
    def create_factory(flags, iid, out):
        calls.append((flags, bytes(iid._obj)))
        out.contents.value = factory
        return 0
    # The software (Basic Render Driver) and remote adapters keep their indices but are not GPUs.
    assert processors._dxgi_adapters(create_factory) == [(0, 0x8086, 0x9a49), (2, 0x10de, 0x2520)]
    assert calls == [(0, processors._IID_IDXGI_FACTORY1)]
    assert sorted(com.released) == sorted(adapters + [factory])


def test_a_failing_dxgi_call_raises_after_releasing_what_it_opened():
    com = Com()
    adapters = [com.adapter(0x8086, 0x9a49), com.adapter(0x10de, 0x2520)]
    factory = com.factory(adapters, failing_index=1)
    def create_factory(flags, iid, out):
        out.contents.value = factory
        return 0
    with pytest.raises(OSError, match=r'EnumAdapters1\(1\) failed \(0x80004005\)'):
        processors._dxgi_adapters(create_factory)
    assert sorted(com.released) == sorted([adapters[0], factory])
    with pytest.raises(OSError, match='CreateDXGIFactory2 failed'):
        processors._dxgi_adapters(lambda flags, iid, out: 0x887A0004 - (1 << 32))


def test_a_missing_gpu_runs_on_the_cpu_and_says_so(devices):
    events = []
    with runtime.session(runtime.parse_options(processor='gpu:10de:2520'), events.append):
        assert runtime.processor() is processors.CPU
        record = runtime.processor_record()
    assert record['requested'] == 'gpu:10de:2520' and record['resolved'] == 'cpu' and record['name'] == 'CPU'
    assert 'not found' in record['note']
    assert [e['message'] for e in events if e['stage'] == 'processor'] == [record['note']]


def test_gpu_sessions_use_directml_on_the_resolved_adapter_without_memory_patterns(monkeypatch, tmp_path, devices):
    devices += [gpu(0, 0x8086, 0x9a49, 'Intel(R) UHD Graphics'), gpu(1)]
    (tmp_path / 's1.onnx').write_bytes(b'graph')
    monkeypatch.setattr(models, 'ONNX_DIRECTORY', tmp_path)
    # The S1 detector's Core ML configuration never joins a GPU session.
    monkeypatch.setattr(models.sys, 'platform', 'darwin')
    monkeypatch.setattr(ort, 'get_available_providers', lambda: ['CoreMLExecutionProvider', 'CPUExecutionProvider'])
    monkeypatch.delenv('SPINE_CONTOUR_ORT_CPU_ONLY', raising=False)
    created, events = [], []
    class Session:
        def __init__(self, path, sess_options, providers, enable_fallback=1):
            assert enable_fallback == 0
            created.append((providers, sess_options.enable_mem_pattern, sess_options.intra_op_num_threads))
            self.providers = [p[0] if isinstance(p, tuple) else p for p in providers]
        def get_providers(self): return self.providers
        def run(self, *args): return [np.zeros(0), np.zeros((0, 2, 3))]
    monkeypatch.setattr(ort, 'InferenceSession', Session)
    models.release_models()
    with runtime.session(runtime.parse_options('standard', 2, processor='gpu:10de:2520'), events.append):
        models._infer('s1', lambda session: session.run(None, {}), 'Detecting')
        assert runtime.providers() == {'s1': ['DmlExecutionProvider', 'CPUExecutionProvider']}
    models.release_models()
    assert len(created) == 1
    providers, mem_pattern, _ = created[0]
    assert providers == [('DmlExecutionProvider', {'device_id': '1'}), 'CPUExecutionProvider']
    assert mem_pattern is False
    assert 'Loading S1 detector on NVIDIA GeForce RTX 3060 Laptop GPU' in [e['message'] for e in events]
    assert models.session_options((2, False, None)).enable_mem_pattern
    assert not models.session_options((2, False, 1)).enable_mem_pattern


def test_changing_processor_replaces_cached_sessions(monkeypatch, devices):
    devices.append(gpu(1))
    loaded = []
    class Model:
        def get_providers(self): return ['CPUExecutionProvider']
    @lru_cache(maxsize=4)
    def load(kind, policy):
        loaded.append((kind, policy))
        return Model()
    models.release_models()
    monkeypatch.setattr(models, '_load_model', load)
    for processor in ['cpu', 'gpu:10de:2520', 'gpu:10de:2520', 'cpu']:
        with runtime.session(runtime.parse_options('standard', 2, processor=processor)):
            models._infer('s1', lambda model: None, None)
    assert [policy[2] for _, policy in loaded] == [None, 1, None]
    models.release_models()


class FailingGpu:
    """A DirectML session that fails on creation or on its first run, as a driver reset would."""
    def __init__(self, failure, calls):
        self.failure, self.calls = failure, calls
    def __call__(self, path, sess_options, providers, enable_fallback=1):
        # InferenceModel owns the fallback; ONNX Runtime's own retry would hide it.
        assert enable_fallback == 0
        names = [p[0] if isinstance(p, tuple) else p for p in providers]
        self.calls.append(names)
        if self.failure == 'create' and len(names) > 1:
            raise ort.capi.onnxruntime_pybind11_state.RuntimeException('D3D12 device could not be created')
        failure = self.failure
        class Session:
            def get_providers(self): return names
            def run(self, *args):
                if failure == 'run' and len(names) > 1:
                    raise ort.capi.onnxruntime_pybind11_state.RuntimeException('887A0005 device removed')
                if failure == 'cpu':
                    raise ort.capi.onnxruntime_pybind11_state.InvalidArgument('bad input')
                return [np.ones(1)]
        return Session()


@pytest.mark.parametrize('failure', ['create', 'run'])
def test_a_gpu_failure_retries_on_the_cpu_once_and_records_the_cpu(monkeypatch, tmp_path, failure):
    calls, events = [], []
    monkeypatch.setattr(ort, 'InferenceSession', FailingGpu(failure, calls))
    providers = [('DmlExecutionProvider', {'device_id': '0'}), 'CPUExecutionProvider']
    with runtime.session(reporter=events.append):
        model = models.InferenceModel(tmp_path / 'hrnet.onnx', (2, False, 0), providers)
        for _ in range(2):
            assert model.run(None, {})[0].tolist() == [1.]
    assert model.get_providers() == ['CPUExecutionProvider']
    assert calls == [['DmlExecutionProvider', 'CPUExecutionProvider'], ['CPUExecutionProvider']]
    assert 'The GPU could not run the HRNet landmark model; using ONNX CPU inference' in [e['message'] for e in events]


def test_a_cpu_error_is_raised_rather_than_retried(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(ort, 'InferenceSession', FailingGpu('cpu', calls))
    model = models.InferenceModel(tmp_path / 'hrnet.onnx', (2, False, None), ['CPUExecutionProvider'])
    with pytest.raises(ort.capi.onnxruntime_pybind11_state.InvalidArgument):
        model.run(None, {})
    assert calls == [['CPUExecutionProvider']]


def test_processors_endpoint_lists_what_the_runtime_offers_and_bad_ids_are_rejected(devices):
    devices.append(gpu(1))
    client = TestClient(server.app)
    assert client.get('/processors').json() == {'processors': [
        {'id': 'cpu', 'kind': 'cpu', 'name': 'CPU', 'memory_mb': None},
        {'id': 'gpu:10de:2520', 'kind': 'gpu', 'name': 'NVIDIA GeForce RTX 3060 Laptop GPU', 'memory_mb': 6144}]}
    response = client.post('/predict-stream', data={'modality': 'xray', 'body_part': 'lumbar', 'view': 'lateral',
                                                    'processor': 'NVIDIA'},
                           files={'file': ('film.png', b'not decoded before validation', 'image/png')})
    assert response.status_code == 422
