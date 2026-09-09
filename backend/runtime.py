"""Per-request resource policy, real progress and cooperative cancellation.

Inference is serialized because Torch's CPU thread count and the model cache are
process-wide. Context variables keep progress and calibration options request-local.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import os
import threading

import torch


class Cancelled(RuntimeError):
    pass


@dataclass(frozen=True)
class Options:
    mode: str = "standard"
    cpu_threads: int = 2

    @property
    def low_memory(self):
        return self.mode == "low-memory"

    @property
    def search_batch(self):
        return 1 if self.low_memory else 8

    @property
    def ocr_timeout(self):
        return 60 if self.low_memory else 8


def parse_options(mode="standard", cpu_threads=2):
    if mode not in ("standard", "low-memory"):
        raise ValueError("Processing mode must be standard or low-memory")
    if isinstance(cpu_threads, bool) or not isinstance(cpu_threads, int) or not 1 <= cpu_threads <= 4:
        raise ValueError("CPU threads must be an integer from 1 to 4")
    return Options(mode, min(cpu_threads, os.cpu_count() or 1))


_options = ContextVar("processing_options", default=Options())
_reporter = ContextVar("processing_reporter", default=None)
_cancel = ContextVar("processing_cancel", default=None)
_last_progress = ContextVar("processing_last_progress", default=None)
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


@contextmanager
def session(settings=None, reporter=None, cancelled=None):
    settings = settings or Options()
    tokens = (_options.set(settings), _reporter.set(reporter), _cancel.set(cancelled), _last_progress.set(None))
    acquired = False
    previous_threads = None
    try:
        report("waiting", "Waiting for the processing worker")
        while not _lock.acquire(timeout=.1):
            checkpoint()
        acquired = True
        checkpoint()
        previous_threads = torch.get_num_threads()
        if settings.low_memory:
            torch.set_num_threads(settings.cpu_threads)
        yield
    finally:
        if previous_threads is not None and settings.low_memory:
            torch.set_num_threads(previous_threads)
        if acquired:
            _lock.release()
        _options.reset(tokens[0])
        _reporter.reset(tokens[1])
        _cancel.reset(tokens[2])
        _last_progress.reset(tokens[3])
