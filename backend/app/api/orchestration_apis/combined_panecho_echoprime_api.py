from __future__ import annotations
from typing import Optional
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.exc import IntegrityError

from app.database.db import get_db
from app.database_models.users import User
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE
from app.background_tasks.combining_panecho_echoprime import combining_panecho_echoprime
from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_from_row
from app.helpers.authentication_functions import get_current_user_id
from app.schemas.orchestration_apis.combined_panecho_echoprime_schemas import (
    CombinedResultsResponse, CompleteResponse, PendingResponse, FailedResponse
)
from app.schemas.orchestration_apis.panecho_echoprime_overrides_schemas import OverridesUpdateRequest

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get(
        "/studies/{study_uid}/PanEcho-EchoPrime-combined-results",
        response_model=CombinedResultsResponse,
)
def get_combined_results(
    study_uid: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Read combined PanEcho + EchoPrime results for a study, enqueue orchestration if missing, and return complete or pending status.

    Steps:
    1. Resolve the study by `study_uid` and look up any existing combined PanEcho+EchoPrime DerivedResult row.
    2. If a complete combined row exists, convert it to a payload and return a 200 `CompleteResponse`.
    3. If a pending/failed row exists, return a 202 `PendingResponse` with a `Retry-After` header, without enqueuing again.
    4. If no combined row exists, create a pending marker row as an idempotency guard.
    5. Only when the pending row is successfully created, enqueue `combining_panecho_echoprime` as a background task.
    6. Return a 202 `PendingResponse` with a `Retry-After` header instructing the client to poll again.
    """
    # --- Part 1: Lookup study + combined row ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    combined_results_row = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE)
        .first()
    )

    # --- Part 1.1: If already present and complete -> return payload ---
    if combined_results_row and combined_results_row.status == ResultStatus.complete:
        payload = build_combined_sections_from_row(combined_results_row)

        logger.info(f"[COMBINED_RESULTS] combined results row is present for study_uid: {study_uid}")

        return CompleteResponse(
            status="complete",
            panecho_echoprime_results=payload
        )
        
    
    # --- Part 1.2: If present and pending -> pending (DON'T enqueue again) ---
    if combined_results_row and combined_results_row.status == ResultStatus.pending:
        pending = PendingResponse(status="pending", retry_after=3)

        logger.info(f"[COMBINED_RESULTS] inferences and orchestration is running for study_uid: {study_uid}")

        # HTTP 202 with Retry-After header tells client to poll again
        return JSONResponse(
            status_code=202,
            content=pending.model_dump(),
            headers={"retry-after": "3"}
        )

    # --- Part 1.3: If present and failed -> failed (DO NOT keep polling) ---
    if combined_results_row and combined_results_row.status == ResultStatus.failed:
        detail = None
        if isinstance(combined_results_row.value_json, dict):
            detail = combined_results_row.value_json.get("error")
        failed = FailedResponse(status="failed", detail=detail or "PanEcho+EchoPrime orchestration failed")
        return JSONResponse(
            status_code=200,
            content=failed.model_dump(),
        )
    
    # --- Part 2: Not found -> try to create pending marker and trigger background task ---
    # --- Part 2.1: Try to create the 'pending' row as our idempotency marker ---
    created = False
    try:
        new_row = DerivedResult(
            study_id = study.id,
            type=PANECHO_ECHOPRIME_COMBINED_TYPE,
            status=ResultStatus.pending,
            model_name="PanEcho_EchoPrime_Combined",
            model_version="v1"
        )
        db.add(new_row)
        db.commit()
        created = True
    except IntegrityError:
        db.rollback()
        # Someone else inserted the pending row in between our SELECT and INSERT.
        # Treat as pending; do NOT enqueue again.
    
    # --- Part 2.2 Enqueue ONLY if we successfully created the marker ---
    if created:
        logger.info(f"[COMBINED_RESULTS] Orchestration and inference started for study_uid: {study_uid}")
        background_tasks.add_task(combining_panecho_echoprime, study_uid)
    
    # --- Part 2.3 Return pending ---
    pending = PendingResponse(status="pending", retry_after=3)
    return JSONResponse(
        status_code=202,
        content=pending.model_dump(),
        headers={"retry-after": "3"}
    )


@router.patch(
    "/studies/{study_uid}/PanEcho-EchoPrime-overrides",
    response_model=CombinedResultsResponse,
)
def update_combined_overrides(
    study_uid: str,
    payload: OverridesUpdateRequest,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Persist doctor overrides for PanEcho+EchoPrime combined results.

    Steps:
    1. Resolve the study by `study_uid` and find the combined results row.
    2. Validate override payloads against task types (numeric vs. label).
    3. Merge overrides into the combined row and return the updated payload.
    """
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    incoming_overrides = payload.overrides or {}

    combined_row = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE)
        .first()
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

    overrides_updated_at = edited_at if incoming_overrides else existing_overrides_updated_at

    combined_row.value_json = {
        "integrated_tasks": integrated_tasks,
        "overrides": overrides,
        "overrides_updated_at": overrides_updated_at,
    }
    flag_modified(combined_row, "value_json")
    db.commit()

    payload = build_combined_sections_from_row(combined_row)
    return CompleteResponse(status="complete", panecho_echoprime_results=payload)
