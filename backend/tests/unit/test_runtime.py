import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import json
import threading
import weakref

import numpy as np
import pytest
import torch

from backend import framing, runtime, ruler_extraction
from backend.models import models
from backend.progress import stream_job


@pytest.mark.parametrize('mode,threads', [('fast', 2), ('standard', 0), ('low-memory', 5), ('standard', True)])
def test_invalid_resource_settings_are_rejected(mode, threads):
    with pytest.raises(ValueError): runtime.parse_options(mode, threads)


def test_low_memory_threads_restore_on_failure_and_request_options_do_not_leak():
    original = torch.get_num_threads()
    with pytest.raises(RuntimeError):
        with runtime.session(runtime.parse_options('low-memory', 1)):
            assert torch.get_num_threads() == 1
            assert runtime.options().ocr_timeout == 60
            raise RuntimeError('model failed')
    assert torch.get_num_threads() == original
    assert runtime.options().mode == 'standard'
    assert runtime.options().ocr_timeout == 8
    with runtime.session(): pass  # failure did not leave the worker locked


def test_all_search_crops_are_identical_in_both_modes_and_progress_counts_real_work():
    image = np.random.default_rng(17).integers(0, 255, (800, 1200), np.uint8)
    seen, sizes, events = [], [], []
    def score(images):
        sizes.append(len(images))
        seen.extend([frame.copy() for frame in images])
        return [(.9, np.array([[300., 450.], [400., 440.]])) for _ in images]
    with runtime.session(reporter=events.append):
        standard = framing.locate(image, score)
    originals, standard_sizes = seen[:], sizes[:]
    seen.clear(); sizes.clear(); events.clear()
    with runtime.session(runtime.parse_options('low-memory', 1), events.append):
        low = framing.locate(image, score)
    assert low == standard
    assert max(standard_sizes) == 8 and set(sizes) == {1}
    assert len(seen) == len(originals) == len(framing.search_windows(*image.shape)) + 1
    assert all(np.array_equal(left, right) for left, right in zip(seen, originals))
    counts = [e['completed'] for e in events if e['stage'] == 'search']
    assert counts == sorted(counts) and counts[0] == 0 and counts[-1] == len(seen)
    assert all(e['total'] == len(seen) for e in events if e['stage'] == 'search')


def test_cancel_stops_before_the_next_search_crop():
    stop = threading.Event()
    calls = []
    def score(images):
        calls.append(len(images)); stop.set()
        return [(0, None)]
    with pytest.raises(runtime.Cancelled):
        with runtime.session(runtime.parse_options('low-memory', 1), cancelled=stop):
            framing.locate(np.zeros((800, 1200), np.uint8), score)
    assert calls == [1]


def test_one_model_resident_in_low_memory_and_s1_is_reused_across_search_windows(monkeypatch):
    references, loaded = [], []
    class Model:
        pass
    @lru_cache(maxsize=8)
    def load(kind, device):
        # No earlier model remains alive at the point the next one is loaded.
        assert all(ref() is None for ref in references)
        model = Model(); references.append(weakref.ref(model)); loaded.append(kind)
        return model
    monkeypatch.setattr(models, '_load_model', load)
    monkeypatch.setattr(models, '_resident_key', None)
    with runtime.session(runtime.parse_options('low-memory', 1)):
        for kind in ['s1', 's1', 's1', 'femoral', 'vertebra', 'hrnet']:
            assert models._infer(kind, 'cpu', lambda _: np.zeros(1), 'Testing').shape == (1,)
        models.release_models()
    assert loaded == ['s1', 'femoral', 'vertebra', 'hrnet']
    assert all(ref() is None for ref in references)


def test_waiting_request_can_cancel_without_changing_active_threads():
    original = torch.get_num_threads()
    stop, waiting = threading.Event(), threading.Event()
    def second():
        def report(_): waiting.set()
        with runtime.session(runtime.parse_options('low-memory', 2), report, stop):
            pytest.fail('cancelled request must not acquire the worker')
    with ThreadPoolExecutor(max_workers=1) as pool:
        with runtime.session(runtime.parse_options('low-memory', 1)):
            future = pool.submit(second)
            assert waiting.wait(2)
            stop.set()
            with pytest.raises(runtime.Cancelled): future.result(timeout=2)
            assert torch.get_num_threads() == 1
    assert torch.get_num_threads() == original


@pytest.mark.parametrize('mode,timeout', [('standard', 8), ('low-memory', 60)])
def test_calibration_uses_the_selected_ocr_budget_and_reports_each_actual_pass(monkeypatch, mode, timeout):
    calls, events = [], []
    def ocr(image, **kwargs):
        calls.append(kwargs['timeout'])
        return {'text': []}
    monkeypatch.setattr(ruler_extraction.pytesseract, 'image_to_data', ocr)
    with runtime.session(runtime.parse_options(mode, 1), events.append):
        assert ruler_extraction.read_labels(np.zeros((40, 40, 3), np.uint8)) == []
    assert calls == [timeout] * 5
    assert [e['completed'] for e in events if e['stage'] == 'ocr'] == [0, 1, 1, 2, 2, 3, 3, 4, 4, 5]


def test_stream_heartbeats_continue_during_work_and_disconnect_cancels_worker():
    finished = threading.Event()
    def work(report, cancelled):
        report({'type': 'progress', 'stage': 'testing', 'message': 'Working'})
        try:
            assert cancelled.wait(3)
        finally:
            finished.set()
    async def run():
        stream = stream_job(work, heartbeat_seconds=.02)
        assert json.loads(await anext(stream))['type'] == 'progress'
        assert json.loads(await anext(stream))['type'] == 'heartbeat'
        await stream.aclose()
        assert await asyncio.to_thread(finished.wait, 2)
    asyncio.run(run())


def test_stream_completes_with_one_result_and_errors_do_not_claim_success():
    async def collect(work):
        return [json.loads(line) async for line in stream_job(work)]
    success = asyncio.run(collect(lambda *_: {'measurements': {'PI': None}}))
    assert len(success) == 1 and success[0]['type'] == 'result'
    def fail(*_): raise ValueError('No usable anatomy')
    error = asyncio.run(collect(fail))
    assert len(error) == 1 and error[0]['type'] == 'error'
    assert error[0]['message'] == 'No usable anatomy'
