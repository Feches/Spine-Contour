"""Newline-delimited progress, heartbeats and one terminal result/error.

The worker stays off the event loop so long model calls do not stop heartbeats.
Disconnecting requests cooperative cancellation at the next processing boundary.
"""
import asyncio
import json
import logging
import threading
import time

from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

try:
    from . import runtime
except ImportError:
    import runtime


async def stream_job(work, heartbeat_seconds=2):
    loop = asyncio.get_running_loop()
    queue = asyncio.Queue()
    cancelled = threading.Event()
    started = time.monotonic()

    def report(event):
        if not cancelled.is_set():
            loop.call_soon_threadsafe(queue.put_nowait, event)

    def worker():
        try:
            result = work(report, cancelled)
            report({"type": "result", "result": result})
        except runtime.Cancelled:
            report({"type": "error", "message": "Processing cancelled."})
        except (HTTPException, ValueError) as error:
            report({"type": "error", "message": str(getattr(error, "detail", error))})
        except Exception:
            logging.getLogger(__name__).exception("Image processing failed")
            report({"type": "error", "message": "Processing failed. Try low-memory mode or restart the app."})

    task = asyncio.create_task(run_in_threadpool(worker))
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=heartbeat_seconds)
            except asyncio.TimeoutError:
                event = {"type": "heartbeat"}
            event["elapsed_seconds"] = round(time.monotonic() - started, 1)
            yield json.dumps(event, allow_nan=False) + "\n"
            if event["type"] in ("result", "error"):
                break
    finally:
        cancelled.set()
        # Cancelling an asyncio wrapper does not interrupt a Torch kernel. Keep
        # ownership of the worker until it reaches its cancellation checkpoint.
        # Its runtime session's finally block restores threads and releases models.
        task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
