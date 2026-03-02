from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.database_models.pipeline_jobs import PipelineJob, PipelineJobStatus
from app.database_models.pipeline_stage_runs import PipelineStageRun, PipelineStageStatus


# Part 1. Stage + job transition helpers for queue runtime.
def _set_stage_running(*, db: Session, job: PipelineJob, stage_row: PipelineStageRun) -> None:
    now = datetime.utcnow()
    job.current_stage = stage_row.stage_name
    stage_row.status = PipelineStageStatus.running
    stage_row.started_at = now
    db.commit()


def _set_stage_completed(*, db: Session, stage_row: PipelineStageRun, payload: Dict[str, Any]) -> None:
    stage_row.status = PipelineStageStatus.completed
    stage_row.finished_at = datetime.utcnow()
    stage_row.payload_json = payload if isinstance(payload, dict) else {}
    db.commit()


def _set_stage_failed(
    *,
    db: Session,
    job: PipelineJob,
    stage_row: PipelineStageRun,
    error: Exception,
) -> None:
    now = datetime.utcnow()
    stage_row.status = PipelineStageStatus.failed
    stage_row.finished_at = now
    stage_row.error = str(error)
    job.status = PipelineJobStatus.failed
    job.current_stage = None
    job.last_error = f"{stage_row.stage_name}: {error}"
    job.finished_at = now
    db.commit()


def _cancel_stage_rows_for_job(*, db: Session, pipeline_job_id: int) -> None:
    now = datetime.utcnow()
    stage_rows = (
        db.query(PipelineStageRun)
        .filter(PipelineStageRun.pipeline_job_id == pipeline_job_id)
        .all()
    )
    for row in stage_rows:
        if row.status in (PipelineStageStatus.completed, PipelineStageStatus.failed, PipelineStageStatus.cancelled):
            continue
        row.status = PipelineStageStatus.cancelled
        if not row.finished_at:
            row.finished_at = now
        if not row.started_at:
            row.started_at = now


__all__ = [
    "_set_stage_running",
    "_set_stage_completed",
    "_set_stage_failed",
    "_cancel_stage_rows_for_job",
]

