from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.auth.authentication_functions import get_current_user_id
from app.schemas.orchestration_apis.pipeline.pipeline_status_schemas import (
    PipelineJobSnapshot,
    PipelineStatusResponse,
)
from app.services.pipeline.service import get_pipeline_status

router = APIRouter()


@router.get(
    "/studies/{study_uid}/pipeline/status",
    response_model=PipelineStatusResponse,
)
def pipeline_status(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Return latest pipeline state for the owned study.

    This route is observer-only and does not enqueue or progress stages.
    """
    pipeline = get_pipeline_status(
        db=db,
        study_uid=study_uid,
        user_id=current_user_id,
    )
    if not pipeline:
        return PipelineStatusResponse(has_job=False, pipeline=None)

    return PipelineStatusResponse(
        has_job=True,
        pipeline=PipelineJobSnapshot(**pipeline),
    )

