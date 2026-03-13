from __future__ import annotations
import logging

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.derived_results import ResultStatus
from app.core.artifacts import DYNAMIC_MEASUREMENTS_COMBINED_TYPE
from app.helpers.auth.authentication_functions import get_current_user_id
from app.helpers.row_to_dict.dynamic_measurements_combined_results_row_to_dict import combined_results_row_to_dict
from app.schemas.results.combined_dynamic_measurements_schemas import (
    CombinedResultsResponse,
    CompleteResponse,
    PendingResponse,
    FailedResponse,
)
from app.services.pipeline.read import (
    get_result_row_for_read_mode,
    get_latest_stage_failure_detail,
    get_study_or_404,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/studies/{study_uid}/Dynamic-Measurements-combined-results",
    response_model=CombinedResultsResponse,
)
def get_dynamic_measurements_combined_results(
    study_uid: str,
    preview: bool = Query(False, description="Return latest draft artifacts when available"),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Observer-only dynamic/measurements combined results endpoint.

    Steps:
    1. Resolve study and read preview/active (or legacy fallback) dynamic row.
    2. Return complete payload when active row is complete.
    3. Return failed payload when active row or latest queue stage indicates failure.
    4. Otherwise return pending without side effects.
    """
    # Part 1. Resolve study and preview-aware row.
    study = get_study_or_404(db=db, study_uid=study_uid, user_id=current_user_id)
    dynamic_row = get_result_row_for_read_mode(
        db=db,
        study_id=study.id,
        result_type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
        preview=preview,
    )

    # Part 2. Complete response for ready active artifact.
    if dynamic_row and dynamic_row.status == ResultStatus.complete:
        payload = combined_results_row_to_dict(dynamic_row)
        return CompleteResponse(status="complete", dynamic_measurements_results=payload)

    # Part 3. Failed response for explicit failed row or failed prerequisite stage.
    if dynamic_row and dynamic_row.status == ResultStatus.failed:
        detail = None
        if isinstance(dynamic_row.value_json, dict):
            detail = dynamic_row.value_json.get("error")
        failed = FailedResponse(status="failed", detail=detail or "Dynamic measurements orchestration failed")
        return JSONResponse(status_code=200, content=failed.model_dump())

    queue_failed_detail = get_latest_stage_failure_detail(
        db=db,
        study_id=study.id,
        stage_names=["combined", "dynamic_measurements"],
    )
    if queue_failed_detail:
        failed = FailedResponse(status="failed", detail=queue_failed_detail)
        return JSONResponse(status_code=200, content=failed.model_dump())

    # Part 4. Observer-only pending response (no enqueue/marker writes).
    pending_results = (
        combined_results_row_to_dict(dynamic_row)
        if dynamic_row and isinstance(dynamic_row.value_json, dict)
        else None
    )
    pending = PendingResponse(
        status="pending",
        retry_after=3,
        dynamic_measurements_results=pending_results,
    )
    return JSONResponse(
        status_code=202,
        content=pending.model_dump(exclude_none=True),
        headers={"retry-after": "3"},
    )
