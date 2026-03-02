from __future__ import annotations

import logging
import threading
from typing import Optional

from app.core.config import settings
from app.database.db import SessionLocal
from app.services.pipeline.service import run_pending_jobs_once

logger = logging.getLogger(__name__)

_scheduler_thread: Optional[threading.Thread] = None
_scheduler_stop_event = threading.Event()
_scheduler_lock = threading.Lock()


def _poll_seconds() -> float:
    return max(float(settings.PIPELINE_POLL_INTERVAL_MS) / 1000.0, 0.1)


def run_scheduler_once() -> int:
    """
    Execute one queue scheduler cycle.

    This helper is intentionally exposed for deterministic tests.
    """
    db = SessionLocal()
    try:
        return run_pending_jobs_once(
            db=db,
            max_active_studies=settings.PIPELINE_MAX_ACTIVE_STUDIES,
        )
    finally:
        db.close()


def _scheduler_loop() -> None:
    interval = _poll_seconds()
    logger.info(
        "[PIPELINE_SCHEDULER] Started (poll=%ss, max_active_studies=%s)",
        interval,
        settings.PIPELINE_MAX_ACTIVE_STUDIES,
    )
    while not _scheduler_stop_event.is_set():
        try:
            run_scheduler_once()
        except Exception as exc:
            logger.exception("[PIPELINE_SCHEDULER] Cycle failed: %s", exc)
        _scheduler_stop_event.wait(interval)
    logger.info("[PIPELINE_SCHEDULER] Stopped")


def start_pipeline_scheduler() -> None:
    """
    Start background scheduler thread if not already running.
    """
    global _scheduler_thread
    with _scheduler_lock:
        if _scheduler_thread and _scheduler_thread.is_alive():
            return
        _scheduler_stop_event.clear()
        _scheduler_thread = threading.Thread(
            target=_scheduler_loop,
            name="pipeline-scheduler",
            daemon=True,
        )
        _scheduler_thread.start()


def stop_pipeline_scheduler(timeout_seconds: float = 2.0) -> None:
    """
    Request scheduler shutdown and wait briefly for thread exit.
    """
    global _scheduler_thread
    with _scheduler_lock:
        if not _scheduler_thread:
            return
        _scheduler_stop_event.set()
        _scheduler_thread.join(timeout=timeout_seconds)
        _scheduler_thread = None


__all__ = [
    "run_scheduler_once",
    "start_pipeline_scheduler",
    "stop_pipeline_scheduler",
]

