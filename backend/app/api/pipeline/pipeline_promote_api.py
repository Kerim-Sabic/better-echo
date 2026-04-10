from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.pipeline.pipeline_promote_schemas import PipelinePromoteResponse
from app.services.auth.principal_service import get_current_doctor_user_id
from app.services.pipeline.service import promote_latest_draft_artifact_set

router = APIRouter()


@router.post(
    "/studies/{study_uid}/pipeline/promote",
    response_model=PipelinePromoteResponse,
)
def pipeline_promote(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_doctor_user_id),
):
    """
    Promote latest successful draft artifact set to active for owned study.

    Returns:
    1. 200 when promotion happens immediately.
    2. 202 when promotion intent is recorded for active queued/running job.
    """
    result = promote_latest_draft_artifact_set(
        db=db,
        study_uid=study_uid,
        user_id=current_user_id,
    )

    response = PipelinePromoteResponse(
        ok=True,
        state=result["state"],
        job_id=result.get("job_id"),
        promoted_artifact_set_id=result.get("promoted_artifact_set_id"),
        discarded_artifact_set_id=result.get("discarded_artifact_set_id"),
        message=result.get("message", "Pipeline promote processed"),
        retry_after=result.get("retry_after"),
    )

    if result["state"] == "pending":
        retry_after = int(result.get("retry_after") or 3)
        return JSONResponse(
            status_code=202,
            content=response.model_dump(),
            headers={"retry-after": str(retry_after)},
        )

    return response

