from __future__ import annotations

import logging
from datetime import datetime
from time import perf_counter
from typing import Any, Callable, Dict, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet
from app.database_models.pipeline_jobs import PipelineJob, PipelineJobStatus, PipelineRunMode
from app.database_models.pipeline_stage_runs import PipelineStageRun, PipelineStageStatus
from app.database_models.studies import Study
from app.helpers.media.frame_cache import study_frame_cache_scope
from app.services.pipeline.internal.registry import get_stage_handler
from app.services.pipeline.internal.state import (
    _set_stage_completed,
    _set_stage_failed,
    _set_stage_running,
)
from app.services.pipeline.internal.store import (
    _get_draft_artifact_set_for_job,
    _promote_draft_artifact_set_for_job,
)

logger = logging.getLogger(__name__)


# Part 1. Execute one stage for a queue job using registry lookup.
def _execute_stage_for_job(
    *,
    db: Session,
    job: PipelineJob,
    stage_name: str,
    draft_artifact_set: PipelineArtifactSet,
    prefilter_payload: Optional[Dict[str, Any]],
    stage_handlers: Optional[Dict[str, Callable[..., Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    confidence_min = float(settings.PIPELINE_VIEW_CONFIDENCE_MIN)
    handler = (stage_handlers or {}).get(stage_name) if isinstance(stage_handlers, dict) else None
    if not handler:
        handler = get_stage_handler(stage_name)
    if not handler:
        return {"skipped": True, "reason": f"UNKNOWN_STAGE:{stage_name}"}

    if stage_name == "prefilter":
        return handler(
            db=db,
            job=job,
            confidence_min=confidence_min,
        )

    if stage_name == "combined":
        effective_prefilter = prefilter_payload
        if not isinstance(effective_prefilter, dict):
            prefilter_handler = (stage_handlers or {}).get("prefilter") if isinstance(stage_handlers, dict) else None
            if not prefilter_handler:
                prefilter_handler = get_stage_handler("prefilter")
            if prefilter_handler:
                effective_prefilter = prefilter_handler(
                    db=db,
                    job=job,
                    confidence_min=confidence_min,
                )
        return handler(
            db=db,
            job=job,
            draft_artifact_set=draft_artifact_set,
            prefilter_payload=effective_prefilter if isinstance(effective_prefilter, dict) else {},
        )

    if stage_name == "dynamic_measurements":
        effective_prefilter = prefilter_payload if isinstance(prefilter_payload, dict) else {"instances": []}
        return handler(
            db=db,
            job=job,
            draft_artifact_set=draft_artifact_set,
            prefilter_payload=effective_prefilter,
        )

    if stage_name == "llm":
        return handler(
            db=db,
            job=job,
            draft_artifact_set=draft_artifact_set,
        )

    return {"skipped": True, "reason": f"UNKNOWN_STAGE:{stage_name}"}


# Part 2. Process one queue job through stage progression skeleton.
def _process_job_skeleton(
    *,
    db: Session,
    job: PipelineJob,
    finalize_cancelled_job,
    stage_handlers: Optional[Dict[str, Callable[..., Dict[str, Any]]]] = None,
) -> None:
    job_id = job.id
    job_started_perf = perf_counter()

    # Part 2.1 Handle cooperative cancellation before any stage work.
    if job.cancel_requested_at:
        study = db.query(Study).filter(Study.id == job.study_id).first()
        if study:
            finalize_cancelled_job(db, study=study, job=job, apply_cleanup=True)
        return

    # Part 2.2 Move queued job to running when worker picks it.
    if job.status == PipelineJobStatus.queued:
        now = datetime.utcnow()
        job.status = PipelineJobStatus.running
        job.started_at = now
        job.updated_at = now
        db.commit()

    # Part 2.3 Resolve draft artifact set and existing prefilter payload for stage chaining.
    draft_artifact_set = _get_draft_artifact_set_for_job(db, job_id=job.id)
    if not draft_artifact_set:
        raise RuntimeError("Draft artifact set missing for active queue job")

    stage_rows = (
        db.query(PipelineStageRun)
        .filter(PipelineStageRun.pipeline_job_id == job.id)
        .order_by(PipelineStageRun.id.asc())
        .all()
    )
    prefilter_payload = None
    for existing_row in stage_rows:
        if (
            existing_row.stage_name == "prefilter"
            and existing_row.status == PipelineStageStatus.completed
            and isinstance(existing_row.payload_json, dict)
        ):
            prefilter_payload = existing_row.payload_json
            break

    # Part 2.4 Execute remaining stages in-order.
    # A per-study decoded frame cache lives exactly as long as this job, so
    # every stage (view classification, EchoPrime, PanEcho, motion
    # segmentation, measurements) shares one decode per cine.
    job_study_uid = job.study.study_uid if job.study else None
    with study_frame_cache_scope(job_study_uid):
        for stage_row in stage_rows:
            if stage_row.status == PipelineStageStatus.completed:
                continue
            if stage_row.status == PipelineStageStatus.cancelled:
                continue

            if job.cancel_requested_at:
                study = db.query(Study).filter(Study.id == job.study_id).first()
                if study:
                    finalize_cancelled_job(db, study=study, job=job, apply_cleanup=True)
                return

            stage_name = stage_row.stage_name
            _set_stage_running(db=db, job=job, stage_row=stage_row)
            stage_started_perf = perf_counter()
            try:
                payload = _execute_stage_for_job(
                    db=db,
                    job=job,
                    stage_name=stage_name,
                    draft_artifact_set=draft_artifact_set,
                    prefilter_payload=prefilter_payload,
                    stage_handlers=stage_handlers,
                )
                _set_stage_completed(db=db, stage_row=stage_row, payload=payload)
                logger.info(
                    "[PIPELINE_QUEUE] Stage completed | job_id=%s stage=%s duration_s=%.3f",
                    job_id,
                    stage_name,
                    perf_counter() - stage_started_perf,
                )
                if stage_name == "prefilter" and isinstance(payload, dict):
                    prefilter_payload = payload
            except Exception as exc:
                logger.warning(
                    "[PIPELINE_QUEUE] Stage failed | job_id=%s stage=%s duration_s=%.3f error=%s",
                    job_id,
                    stage_name,
                    perf_counter() - stage_started_perf,
                    exc,
                )
                try:
                    _set_stage_failed(db=db, job=job, stage_row=stage_row, error=exc)
                except Exception as state_exc:
                    db.rollback()
                    logger.warning(
                        "[PIPELINE_QUEUE] Could not persist stage failure | job_id=%s stage=%s reason=%s",
                        job_id,
                        stage_name,
                        state_exc,
                    )
                return

    # Part 2.5 Mark job complete once all stages are complete.
    if (not job.cancel_requested_at) and all(row.status == PipelineStageStatus.completed for row in stage_rows):
        should_auto_promote = job.run_mode == PipelineRunMode.regenerate_combined or bool(job.auto_promote_on_complete)
        if should_auto_promote:
            study = db.query(Study).filter(Study.id == job.study_id).first()
            if not study:
                raise RuntimeError("Study not found for auto-promote")
            promoted_artifact_set_id = _promote_draft_artifact_set_for_job(db, study=study, job=job)
            job.auto_promote_on_complete = False
            logger.info(
                "[PIPELINE_QUEUE] Auto-promoted job %s draft artifact_set_id=%s",
                job.id,
                promoted_artifact_set_id,
            )
        job.status = PipelineJobStatus.completed
        job.current_stage = None
        job.finished_at = datetime.utcnow()
        db.commit()
        logger.info(
            "[PIPELINE_QUEUE] Job completed | job_id=%s duration_s=%.3f",
            job_id,
            perf_counter() - job_started_perf,
        )


__all__ = [
    "_execute_stage_for_job",
    "_process_job_skeleton",
]
