from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.auth.authentication_functions import get_current_user_id
from app.schemas.orchestration_apis.pipeline.pipeline_promote_schemas import PipelinePromoteResponse
from app.services.pipeline.service import promote_latest_draft_artifact_set

router = APIRouter()


@router.post(
    "/studies/{study_uid}/pipeline/promote",
    response_model=PipelinePromoteResponse,
)
def pipeline_promote(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Promote latest successful draft artifact set to active for owned study.
    """
    result = promote_latest_draft_artifact_set(
        db=db,
        study_uid=study_uid,
        user_id=current_user_id,
    )
    return PipelinePromoteResponse(
        ok=True,
        job_id=result["job_id"],
        promoted_artifact_set_id=result["promoted_artifact_set_id"],
        discarded_artifact_set_id=result["discarded_artifact_set_id"],
        message="Draft artifact set promoted to active",
    )

