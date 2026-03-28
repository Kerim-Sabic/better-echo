from __future__ import annotations
from typing import Optional
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database.db import get_db
from app.database_models.users import User
from app.database_models.derived_results import ResultStatus
from app.core.artifacts import (
    ANALYSIS_OVERRIDES_ROUTE_SEGMENT,
    ANALYSIS_RESULTS_ROUTE_SEGMENT,
    COMBINED_ANALYSIS_TYPES,
)
from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_from_row
from app.helpers.auth.authentication_functions import get_current_user_id
from app.schemas.results.combined_study_analysis_schemas import (
    CombinedResultsResponse,
    CompleteResponse,
    PendingResponse,
    FailedResponse,
)
from app.schemas.results.study_analysis_overrides_schemas import OverridesUpdateRequest
from app.services.results import build_combined_display_payload
from app.services.pipeline.read import (
    get_active_or_legacy_result_row,
    get_result_row_for_read_mode,
    get_latest_stage_failure_detail,
    get_study_or_404,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_complete_payload(combined_results_row) -> dict:
    payload = build_combined_sections_from_row(combined_results_row)
    payload["display"] = build_combined_display_payload(combined_results_row)
    return payload


@router.get(
    f"/studies/{{study_uid}}/{ANALYSIS_RESULTS_ROUTE_SEGMENT}",
    response_model=CombinedResultsResponse,
)
def get_combined_results(
    study_uid: str,
    preview: bool = Query(False, description="Return latest draft artifacts when available"),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Observer-only study analysis results endpoint.

    Steps:
    1. Resolve study and read preview/active (or legacy fallback) combined row.
    2. Return complete payload when active row is complete.
    3. Return failed payload when active row or latest queue stage indicates failure.
    4. Otherwise return pending without side effects.
    """
    # Part 1. Resolve study and preview-aware row.
    study = get_study_or_404(db=db, study_uid=study_uid, user_id=current_user_id)
    combined_results_row = get_result_row_for_read_mode(
        db=db,
        study_id=study.id,
        result_type=COMBINED_ANALYSIS_TYPES,
        preview=preview,
    )

    # Part 2. Complete response for ready active artifact.
    if combined_results_row and combined_results_row.status == ResultStatus.complete:
        payload = _build_complete_payload(combined_results_row)
        return CompleteResponse(status="complete", analysis_results=payload)

    # Part 3. Failed response for explicit failed row or failed queue stage.
    if combined_results_row and combined_results_row.status == ResultStatus.failed:
        detail = None
        if isinstance(combined_results_row.value_json, dict):
            detail = combined_results_row.value_json.get("error")
        failed = FailedResponse(status="failed", detail=detail or "Study analysis orchestration failed")
        return JSONResponse(status_code=200, content=failed.model_dump())

    queue_failed_detail = get_latest_stage_failure_detail(
        db=db,
        study_id=study.id,
        stage_names=["combined"],
    )
    if queue_failed_detail:
        failed = FailedResponse(status="failed", detail=queue_failed_detail)
        return JSONResponse(status_code=200, content=failed.model_dump())

    # Part 4. Observer-only pending response (no enqueue/marker writes).
    pending = PendingResponse(status="pending", retry_after=3)
    return JSONResponse(
        status_code=202,
        content=pending.model_dump(),
        headers={"retry-after": "3"},
    )


@router.patch(
    f"/studies/{{study_uid}}/{ANALYSIS_OVERRIDES_ROUTE_SEGMENT}",
    response_model=CombinedResultsResponse,
)
def update_combined_overrides(
    study_uid: str,
    payload: OverridesUpdateRequest,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Persist doctor overrides for active study analysis results.

    Steps:
    1. Resolve study and active combined row.
    2. Validate override payload by task type.
    3. Merge and persist overrides on active row.
    """
    # Part 1. Resolve study and active/legacy combined row.
    study = get_study_or_404(db=db, study_uid=study_uid, user_id=current_user_id)
    incoming_overrides = payload.overrides or {}

    combined_row = get_active_or_legacy_result_row(
        db=db,
        study_id=study.id,
        result_type=COMBINED_ANALYSIS_TYPES,
    )
    if not combined_row or combined_row.status != ResultStatus.complete:
        raise HTTPException(status_code=409, detail="Combined results are not ready")

    value_json = combined_row.value_json if isinstance(combined_row.value_json, dict) else {}
    integrated_tasks = value_json.get("integrated_tasks") if "integrated_tasks" in value_json else value_json
    if not isinstance(integrated_tasks, dict):
        raise HTTPException(status_code=500, detail="Combined results payload is invalid")

    overrides = value_json.get("overrides") if isinstance(value_json, dict) else {}
    overrides = dict(overrides) if isinstance(overrides, dict) else {}
    existing_overrides_updated_at = (
        value_json.get("overrides_updated_at") if isinstance(value_json, dict) else None
    )

    user = db.query(User).filter(User.id == current_user_id).first()
    editor_name = (user.full_name or user.username) if user else None
    edited_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    # Part 2. Validate and merge override payload.
    for key, item in incoming_overrides.items():
        if item is None:
            overrides.pop(key, None)
            continue

        task = integrated_tasks.get(key)
        if not isinstance(task, dict):
            raise HTTPException(status_code=400, detail=f"Unknown task key: {key}")

        units = task.get("units")
        has_value = item.value is not None
        has_label = item.label is not None

        if has_value and has_label:
            raise HTTPException(status_code=400, detail=f"Override for '{key}' must specify value or label, not both")

        if has_value:
            if units is None:
                raise HTTPException(status_code=400, detail=f"Override for '{key}' must be a label")
            overrides[key] = {
                "value": float(item.value),
                "edited_by": {"id": current_user_id, "name": editor_name},
                "edited_at": edited_at,
            }
            continue

        if has_label:
            if units is not None:
                raise HTTPException(status_code=400, detail=f"Override for '{key}' must be a numeric value")
            overrides[key] = {
                "label": item.label,
                "edited_by": {"id": current_user_id, "name": editor_name},
                "edited_at": edited_at,
            }
            continue

        overrides.pop(key, None)

    # Part 3. Persist override payload.
    overrides_updated_at = edited_at if incoming_overrides else existing_overrides_updated_at
    combined_row.value_json = {
        "integrated_tasks": integrated_tasks,
        "overrides": overrides,
        "overrides_updated_at": overrides_updated_at,
    }
    flag_modified(combined_row, "value_json")
    db.commit()

    result_payload = _build_complete_payload(combined_row)
    return CompleteResponse(status="complete", analysis_results=result_payload)

