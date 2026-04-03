from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.auth.authentication_functions import get_current_user_id
from app.schemas.pipeline.pipeline_cancel_schemas import PipelineCancelResponse
from app.services.pipeline.service import cancel_pipeline_job

router = APIRouter()


@router.post(
    "/studies/{study_uid}/pipeline/cancel",
    response_model=PipelineCancelResponse,
)
def pipeline_cancel(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Cancel latest cancellable queue job for owned study.
    """
    result = cancel_pipeline_job(
        db=db,
        study_uid=study_uid,
        user_id=current_user_id,
    )

    if result.get("cancel_requested"):
        message = "Cancellation requested; worker will stop at checkpoint"
    else:
        message = "Pipeline job cancelled"

    return PipelineCancelResponse(
        ok=True,
        job_id=result["job_id"],
        status=result["status"],
        cancel_requested=result["cancel_requested"],
        cleanup_scope=result["cleanup_scope"],
        cleanup_summary=result["cleanup_summary"],
        message=message,
    )

