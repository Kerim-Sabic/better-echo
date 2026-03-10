from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.auth.authentication_functions import get_current_user_id
from app.schemas.pipeline.pipeline_start_schemas import (
    PipelineStartRequest,
    PipelineStartResponse,
)
from app.services.pipeline.service import start_pipeline_job

router = APIRouter()


@router.post(
    "/studies/{study_uid}/pipeline/start",
    response_model=PipelineStartResponse,
)
def pipeline_start(
    study_uid: str,
    payload: PipelineStartRequest,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Start (or reuse) an idempotent pipeline job for a study.

    Steps:
    1. Validate study ownership from `study_uid` + authenticated user.
    2. Reuse existing active job (queued/running) if present.
    3. Otherwise create queued job + stage rows for scheduler execution.
    """
    job, created_new = start_pipeline_job(
        db=db,
        study_uid=study_uid,
        user_id=current_user_id,
        run_mode=payload.run_mode,
        cleanup_scope=payload.cleanup_scope,
        uploaded_instance_uids=payload.uploaded_instance_uids,
    )

    return PipelineStartResponse(
        created_new=created_new,
        job_id=job.id,
        status=job.status,
        run_mode=job.run_mode,
        cleanup_scope=job.cleanup_scope,
        queued_at=job.queued_at,
    )

