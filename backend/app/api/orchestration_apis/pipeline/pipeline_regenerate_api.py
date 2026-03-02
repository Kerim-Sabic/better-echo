from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.pipeline_jobs import PipelineCleanupScope, PipelineRunMode
from app.helpers.auth.authentication_functions import get_current_user_id
from app.schemas.orchestration_apis.pipeline.pipeline_regenerate_schemas import (
    PipelineRegenerateResponse,
)
from app.services.pipeline.service import start_pipeline_job

router = APIRouter()


@router.post(
    "/studies/{study_uid}/pipeline/regenerate-combined",
    response_model=PipelineRegenerateResponse,
)
def pipeline_regenerate_combined(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Enqueue regenerate-combined queue run for an owned study.

    Steps:
    1. Validate ownership and active combined baseline.
    2. Start or reuse idempotent regenerate job.
    3. Return queued job snapshot for observer polling.
    """
    job, created_new = start_pipeline_job(
        db=db,
        study_uid=study_uid,
        user_id=current_user_id,
        run_mode=PipelineRunMode.regenerate_combined,
        cleanup_scope=PipelineCleanupScope.none,
        uploaded_instance_uids=[],
    )

    return PipelineRegenerateResponse(
        created_new=created_new,
        job_id=job.id,
        status=job.status,
        run_mode=job.run_mode,
        queued_at=job.queued_at,
        message=(
            "Regenerate combined pipeline enqueued"
            if created_new
            else "Existing regenerate combined pipeline is already active"
        ),
    )

