"""Per-request resource policy, real progress and cooperative cancellation.

Inference is serialized to bound model/session memory across concurrent requests.
Context variables keep progress and calibration options request-local.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import os
import threading

class Cancelled(RuntimeError):
    pass


@dataclass(frozen=True)
class Options:
    mode: str = "standard"
    cpu_threads: int = 2
    crop_localizer: bool = True

    @property
    def low_memory(self):
        return self.mode == "low-memory"

    @property
    def inference_threads(self):
        return self.cpu_threads if self.low_memory else min(4, os.cpu_count() or 1)

    @property
    def search_batch(self):
        # The ONNX detector has a fixed batch of one in both resource modes.
        return 1

    @property
    def ocr_timeout(self):
        return 60 if self.low_memory else 8


def parse_options(mode="standard", cpu_threads=2, crop_localizer=True):
    if mode not in ("standard", "low-memory"):
        raise ValueError("Processing mode must be standard or low-memory")
    if isinstance(cpu_threads, bool) or not isinstance(cpu_threads, int) or not 1 <= cpu_threads <= 4:
        raise ValueError("CPU threads must be an integer from 1 to 4")
    if not isinstance(crop_localizer, bool):
        raise ValueError("Crop localizer must be on or off")
    return Options(mode, min(cpu_threads, os.cpu_count() or 1), crop_localizer)


_options = ContextVar("processing_options", default=Options())
_reporter = ContextVar("processing_reporter", default=None)
_cancel = ContextVar("processing_cancel", default=None)
_last_progress = ContextVar("processing_last_progress", default=None)
_providers = ContextVar("processing_providers", default=None)
_lock = threading.Lock()


def options():
    return _options.get()


def checkpoint():
    cancelled = _cancel.get()
    if cancelled is not None and cancelled.is_set():
        raise Cancelled("Processing cancelled.")


def report(stage, message, completed=None, total=None):
    checkpoint()
    event = {"type": "progress", "stage": stage, "message": message,
             "completed": completed, "total": total}
    _last_progress.set(event)
    reporter = _reporter.get()
    if reporter:
        reporter(event)


def current_progress():
    return _last_progress.get()


def record_providers(kind, providers):
    current = _providers.get()
    if current is not None:
        current[kind] = list(providers)


def providers():
    return dict(_providers.get() or {})


@contextmanager
def session(settings=None, reporter=None, cancelled=None):
    settings = settings or Options()
    tokens = (_options.set(settings), _reporter.set(reporter), _cancel.set(cancelled), _last_progress.set(None), _providers.set({}))
    acquired = False
    try:
        report("waiting", "Waiting for the processing worker")
        while not _lock.acquire(timeout=.1):
            checkpoint()
        acquired = True
        checkpoint()
        yield
    finally:
        if acquired:
            _lock.release()
        _options.reset(tokens[0])
        _reporter.reset(tokens[1])
        _cancel.reset(tokens[2])
        _last_progress.reset(tokens[3])
        _providers.reset(tokens[4])
