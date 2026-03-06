from __future__ import annotations

from datetime import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.helpers.pipeline.study_status import is_llm_enabled
from app.database_models.pipeline_artifact_sets import (
    PipelineArtifactSet,
    PipelineArtifactSetState,
)
from app.database_models.pipeline_jobs import (
    PipelineCleanupScope,
    PipelineJob,
    PipelineJobStatus,
    PipelineRunMode,
)
from app.database_models.pipeline_stage_runs import (
    PipelineStageRun,
    PipelineStageStatus,
)
from app.database_models.studies import Study
from app.services.pipeline.cleanup import (
    cleanup_append_delta_scope,
    cleanup_new_study_scope,
)
from app.services.pipeline.internal.registry import STAGE_HANDLER_MAP
from app.services.pipeline.internal.serializers import _serialize_job
from app.services.pipeline.internal.runner import _process_job_skeleton
from app.services.pipeline.internal.state import _cancel_stage_rows_for_job
from app.services.pipeline.internal.store import (
    _active_job_query,
    _create_draft_artifact_set_for_job,
    _ensure_active_artifact_set_and_backfill,
    _get_draft_artifact_set_for_job,
    _get_latest_artifact_set_for_study,
    _has_active_combined_baseline,
    _promote_draft_artifact_set_for_job,
    _resolve_owned_study_or_404,
)

logger = logging.getLogger(__name__)


# Part 1. Stage order templates for queue jobs.
BASE_STAGE_ORDER = ["prefilter", "combined", "dynamic_measurements"]
LLM_STAGE = "llm"


def _stage_handlers_for_runtime() -> Dict[str, Any]:
    # Part 1. Runtime handler map comes from canonical stage registry.
    return dict(STAGE_HANDLER_MAP)


def _empty_cleanup_summary() -> Dict[str, Any]:
    return {
        "study_deleted": False,
        "orthanc_study_deleted": False,
        "orthanc_instances_deleted": 0,
        "instances_deleted": 0,
        "series_deleted": 0,
        "files_deleted": 0,
        "folders_deleted": 0,
        "folders_missing": 0,
        "errors": [],
    }


def _stage_order_for_mode(run_mode: PipelineRunMode, llm_enabled: bool) -> List[str]:
    if run_mode == PipelineRunMode.regenerate_combined:
        return ["combined"]

    stages = list(BASE_STAGE_ORDER)
    if llm_enabled:
        stages.append(LLM_STAGE)
    return stages


def start_pipeline_job(
    *,
    db: Session,
    study_uid: str,
    user_id: int,
    run_mode: PipelineRunMode,
    cleanup_scope: PipelineCleanupScope,
    uploaded_instance_uids: Optional[List[str]] = None,
) -> Tuple[PipelineJob, bool]:
    """
    Create an idempotent queue job for a study.

    Returns:
        (job, created_new)
    """
    study = _resolve_owned_study_or_404(db, study_uid, user_id)
    _ensure_active_artifact_set_and_backfill(db, study_id=study.id)

    # Part 1.1 Validate regenerate mode contract before reusing/creating jobs.
    if run_mode == PipelineRunMode.regenerate_combined:
        if cleanup_scope != PipelineCleanupScope.none:
            raise HTTPException(status_code=400, detail="regenerate_combined requires cleanup_scope=none")
        if uploaded_instance_uids:
            raise HTTPException(status_code=400, detail="regenerate_combined does not accept uploaded_instance_uids")
        if not _has_active_combined_baseline(db, study_id=study.id):
            raise HTTPException(status_code=409, detail="No active combined baseline found for regenerate_combined")

    # Part 2. Idempotent guard: reuse active study job.
    existing_active = _active_job_query(db, study.id).first()
    if existing_active:
        db.commit()
        return existing_active, False

    # Part 3. Create queued job, draft artifact set, and stage rows.
    llm_enabled = is_llm_enabled()
    stage_order = _stage_order_for_mode(run_mode, llm_enabled)
    job = PipelineJob(
        study_id=study.id,
        user_id=user_id,
        status=PipelineJobStatus.queued,
        current_stage=None,
        run_mode=run_mode,
        cleanup_scope=cleanup_scope,
        uploaded_instance_uids_json=uploaded_instance_uids or [],
    )
    db.add(job)
    db.flush()
    _create_draft_artifact_set_for_job(db, job=job)

    for stage_name in stage_order:
        db.add(
            PipelineStageRun(
                pipeline_job_id=job.id,
                study_id=study.id,
                stage_name=stage_name,
                status=PipelineStageStatus.queued,
            )
        )

    db.commit()
    db.refresh(job)
    return job, True


def get_pipeline_status(*, db: Session, study_uid: str, user_id: int) -> Optional[Dict[str, Any]]:
    """
    Return most recent pipeline job status for an owned study.
    """
    study = _resolve_owned_study_or_404(db, study_uid, user_id)
    latest_job = (
        db.query(PipelineJob)
        .filter(PipelineJob.study_id == study.id)
        .order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc())
        .first()
    )
    if not latest_job:
        return None

    stage_rows = (
        db.query(PipelineStageRun)
        .filter(PipelineStageRun.pipeline_job_id == latest_job.id)
        .order_by(PipelineStageRun.id.asc())
        .all()
    )
    draft_artifact_set = _get_draft_artifact_set_for_job(db, job_id=latest_job.id)
    active_artifact_set = _get_latest_artifact_set_for_study(
        db,
        study_id=study.id,
        state=PipelineArtifactSetState.active,
    )
    return _serialize_job(
        latest_job,
        stage_rows,
        draft_artifact_set=draft_artifact_set,
        active_artifact_set=active_artifact_set,
    )


def promote_latest_draft_artifact_set(*, db: Session, study_uid: str, user_id: int) -> Dict[str, Any]:
    """
    Promote latest successful draft artifact set to active.

    Behavior:
    1. Return `promoted` when a completed draft can be promoted immediately.
    2. Return `pending` when an active queued/running job exists and auto-promote intent is recorded.
    3. Return 409 when no promotable draft and no active job context exists.
    """
    study = _resolve_owned_study_or_404(db, study_uid, user_id)

    # Part 1. Find latest completed queue job that still has a draft artifact set.
    promotable_jobs = (
        db.query(PipelineJob)
        .filter(
            PipelineJob.study_id == study.id,
            PipelineJob.status == PipelineJobStatus.completed,
        )
        .order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc())
        .all()
    )
    selected_job = None
    selected_draft = None
    for job in promotable_jobs:
        draft = _get_draft_artifact_set_for_job(db, job_id=job.id)
        if draft:
            selected_job = job
            selected_draft = draft
            break

    if selected_job and selected_draft:
        # Part 2. Discard current active set and promote selected draft set atomically.
        now = datetime.utcnow()
        previous_active = _get_latest_artifact_set_for_study(
            db,
            study_id=study.id,
            state=PipelineArtifactSetState.active,
        )
        discarded_artifact_set_id = None
        if previous_active and previous_active.id != selected_draft.id:
            previous_active.state = PipelineArtifactSetState.discarded
            previous_active.discarded_at = now
            discarded_artifact_set_id = previous_active.id

        selected_draft.state = PipelineArtifactSetState.active
        selected_draft.promoted_at = now
        selected_job.auto_promote_on_complete = False
        db.commit()

        return {
            "state": "promoted",
            "job_id": selected_job.id,
            "promoted_artifact_set_id": selected_draft.id,
            "discarded_artifact_set_id": discarded_artifact_set_id,
            "message": "Draft artifact set promoted to active",
            "retry_after": None,
        }

    # Part 3. If an active queued/running job exists, record promote intent and return pending.
    active_job = _active_job_query(db, study.id).first()
    if active_job:
        if not active_job.auto_promote_on_complete:
            active_job.auto_promote_on_complete = True
            db.commit()
        return {
            "state": "pending",
            "job_id": active_job.id,
            "promoted_artifact_set_id": None,
            "discarded_artifact_set_id": None,
            "message": "Promotion queued; draft will auto-promote when pipeline completes",
            "retry_after": 3,
        }

    # Part 4. Idempotent no-op: latest completed job already owns active set.
    latest_job = (
        db.query(PipelineJob)
        .filter(PipelineJob.study_id == study.id)
        .order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc())
        .first()
    )
    active_set = _get_latest_artifact_set_for_study(
        db,
        study_id=study.id,
        state=PipelineArtifactSetState.active,
    )
    if latest_job and latest_job.status == PipelineJobStatus.completed and active_set and active_set.pipeline_job_id == latest_job.id:
        return {
            "state": "promoted",
            "job_id": latest_job.id,
            "promoted_artifact_set_id": active_set.id,
            "discarded_artifact_set_id": None,
            "message": "Latest pipeline output is already active",
            "retry_after": None,
        }

    raise HTTPException(status_code=409, detail="No promotable draft artifact set found")


def _discard_draft_artifact_set_for_job(db: Session, *, job_id: int) -> Optional[PipelineArtifactSet]:
    draft_set = _get_draft_artifact_set_for_job(db, job_id=job_id)
    if not draft_set:
        return None
    draft_set.state = PipelineArtifactSetState.discarded
    draft_set.discarded_at = datetime.utcnow()
    return draft_set


def _apply_cleanup_for_job(db: Session, *, study: Study, job: PipelineJob) -> Dict[str, Any]:
    uploaded_instance_uids = (
        job.uploaded_instance_uids_json
        if isinstance(job.uploaded_instance_uids_json, list)
        else []
    )

    if job.cleanup_scope == PipelineCleanupScope.new_study:
        return cleanup_new_study_scope(db, study=study)
    if job.cleanup_scope == PipelineCleanupScope.append_delta:
        return cleanup_append_delta_scope(
            db,
            study=study,
            uploaded_instance_uids=uploaded_instance_uids,
        )
    return _empty_cleanup_summary()


def _finalize_cancelled_job(
    db: Session,
    *,
    study: Study,
    job: PipelineJob,
    apply_cleanup: bool,
) -> Dict[str, Any]:
    # Part 1. Move queue job and stage rows to cancelled.
    now = datetime.utcnow()
    job.status = PipelineJobStatus.cancelled
    job.current_stage = None
    job.finished_at = now
    job.auto_promote_on_complete = False
    if not job.cancel_requested_at:
        job.cancel_requested_at = now
    _cancel_stage_rows_for_job(db=db, pipeline_job_id=job.id)

    # Part 2. Discard draft artifact set for this job.
    _discard_draft_artifact_set_for_job(db, job_id=job.id)

    # Part 3. Apply cleanup semantics by scope.
    summary = _empty_cleanup_summary()
    if apply_cleanup:
        summary = _apply_cleanup_for_job(db, study=study, job=job)

    db.commit()
    return summary


def _select_cancel_target_job(db: Session, *, study_id: int) -> Optional[PipelineJob]:
    # Part 1. Prefer active queued/running jobs.
    active_job = _active_job_query(db, study_id).first()
    if active_job:
        return active_job

    # Part 2. Fallback: latest completed job that still owns a draft set.
    completed_jobs = (
        db.query(PipelineJob)
        .filter(
            PipelineJob.study_id == study_id,
            PipelineJob.status == PipelineJobStatus.completed,
        )
        .order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc())
        .all()
    )
    for job in completed_jobs:
        if _get_draft_artifact_set_for_job(db, job_id=job.id):
            return job
    return None


def cancel_pipeline_job(*, db: Session, study_uid: str, user_id: int) -> Dict[str, Any]:
    """
    Cancel latest cancellable queue job for an owned study.
    """
    study = _resolve_owned_study_or_404(db, study_uid, user_id)
    job = _select_cancel_target_job(db, study_id=study.id)
    if not job:
        raise HTTPException(status_code=409, detail="No cancellable pipeline job found")
    job_id = job.id
    cleanup_scope_value = job.cleanup_scope.value

    # Part 1. Running jobs are cancelled cooperatively by scheduler checkpoint.
    if job.status == PipelineJobStatus.running:
        job.cancel_requested_at = datetime.utcnow()
        db.commit()
        return {
            "job_id": job_id,
            "status": job.status.value,
            "cancel_requested": True,
            "cleanup_scope": cleanup_scope_value,
            "cleanup_summary": _empty_cleanup_summary(),
        }

    # Part 2. Queued/completed jobs are cancelled immediately.
    summary = _finalize_cancelled_job(db, study=study, job=job, apply_cleanup=True)
    return {
        "job_id": job_id,
        "status": PipelineJobStatus.cancelled.value,
        "cancel_requested": False,
        "cleanup_scope": cleanup_scope_value,
        "cleanup_summary": summary,
    }


def run_pending_jobs_once(*, db: Session, max_active_studies: int) -> int:
    """
    Execute one scheduler cycle for queued jobs.
    """
    processed = 0

    # Part 1. Honor cooperative cancellation for running jobs first.
    running_cancel_jobs = (
        db.query(PipelineJob)
        .filter(
            PipelineJob.status == PipelineJobStatus.running,
            PipelineJob.cancel_requested_at.isnot(None),
        )
        .order_by(PipelineJob.cancel_requested_at.asc(), PipelineJob.id.asc())
        .all()
    )
    for job in running_cancel_jobs:
        job_id = job.id
        try:
            _process_job_skeleton(
                db=db,
                job=job,
                finalize_cancelled_job=_finalize_cancelled_job,
                stage_handlers=_stage_handlers_for_runtime(),
            )
            processed += 1
        except Exception as exc:
            logger.exception("[PIPELINE_QUEUE] Cancel checkpoint failed for job_id=%s: %s", job_id, exc)
            try:
                job.status = PipelineJobStatus.failed
                job.current_stage = None
                job.last_error = str(exc)
                job.finished_at = datetime.utcnow()
                db.commit()
            except Exception as mark_exc:
                db.rollback()
                logger.warning(
                    "[PIPELINE_QUEUE] Could not mark cancel-checkpoint job failed | job_id=%s reason=%s",
                    job_id,
                    mark_exc,
                )

    running_count = (
        db.query(PipelineJob)
        .filter(PipelineJob.status == PipelineJobStatus.running)
        .count()
    )
    available_slots = max(max_active_studies - running_count, 0)
    if available_slots <= 0:
        return processed

    # Part 2. Process queued jobs within available slots.
    queued_jobs = (
        db.query(PipelineJob)
        .filter(PipelineJob.status == PipelineJobStatus.queued)
        .order_by(PipelineJob.queued_at.asc(), PipelineJob.id.asc())
        .limit(available_slots)
        .all()
    )

    for job in queued_jobs:
        job_id = job.id
        try:
            _process_job_skeleton(
                db=db,
                job=job,
                finalize_cancelled_job=_finalize_cancelled_job,
                stage_handlers=_stage_handlers_for_runtime(),
            )
            processed += 1
        except Exception as exc:
            logger.exception("[PIPELINE_QUEUE] Job failed in scheduler skeleton | job_id=%s error=%s", job_id, exc)
            try:
                job.status = PipelineJobStatus.failed
                job.current_stage = None
                job.last_error = str(exc)
                job.finished_at = datetime.utcnow()
                db.commit()
            except Exception as mark_exc:
                db.rollback()
                logger.warning(
                    "[PIPELINE_QUEUE] Could not mark queued job failed | job_id=%s reason=%s",
                    job_id,
                    mark_exc,
                )

    return processed


__all__ = [
    "start_pipeline_job",
    "get_pipeline_status",
    "promote_latest_draft_artifact_set",
    "cancel_pipeline_job",
    "run_pending_jobs_once",
]
