from __future__ import annotations
from typing import Optional
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database.db import get_db
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.core.artifacts import (
    DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
    PANECHO_ECHOPRIME_COMBINED_TYPE,
)
from app.background_tasks.combining_dynamic_measurements import combining_dynamic_measurements
from app.helpers.row_to_dict.dynamic_measurements_combined_results_row_to_dict import combined_results_row_to_dict
from app.schemas.orchestration_apis.combined_dynamic_measurements_schemas import (
    CombinedResultsResponse, CompleteResponse, PendingResponse
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/studies/{study_uid}/Dynamic-Measurements-combined-results",
    response_model=CombinedResultsResponse,
)
def get_dynamic_measurements_combined_results(
    study_uid: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Return dynamic measurements combined results for a study, enqueue orchestration if missing, and return complete or pending status.

    Steps:
    1. Resolve the study by `study_uid` and look up any existing Dynamic_Measurements_Combined DerivedResult row.
    2. If a complete combined row exists, convert it to a payload and return a 200 `CompleteResponse`.
    3. If a pending/failed combined row exists, return a 202 `PendingResponse` with a `Retry-After` header, without enqueuing again.
    4. If no combined row exists, check if PanEcho+EchoPrime combined row exists
    5. If PanEcho+EchoPrime combined row does not exist return a 202 `PendingResponse` with a `Retry-After` header.
    6. If PanEcho+EchoPrime combined row does exist, create a pending marker row as an idempotency guard for the Dynamics+Measurements results
    7. Only when the pending row is successfully created, enqueue `combining_dynamic_measurements` as a background task.
    8. Return a 202 `PendingResponse` with a `Retry-After` header so the client can poll for completion.
    """
    # --- Part 1: Lookup study + combined row ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    dynamic_measurements_combined_row = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id,
                DerivedResult.type == DYNAMIC_MEASUREMENTS_COMBINED_TYPE)
                .first()
    )

    # --- Part 1.1 If already present and complete -> return payload ---
    if dynamic_measurements_combined_row and dynamic_measurements_combined_row.status == ResultStatus.complete:
        payload = combined_results_row_to_dict(dynamic_measurements_combined_row)

        logger.info(f"[DYNAMIC_MEASUREMENTS_COMBINED] combined results row is present for study_uid: {study_uid}")
        return CompleteResponse(
            status="complete",
            dynamic_measurements_results=payload
        )
    
    # --- Part 1.2 If present but not complete -> pending (DON'T enqueue again) ---
    if dynamic_measurements_combined_row and dynamic_measurements_combined_row.status in (ResultStatus.pending, ResultStatus.failed):
        pending = PendingResponse(status="pending", retry_after=3)

        logger.info(f"[DYNAMIC_MEASUREMENTS_COMBINED] inference and orchestration is running for study_uid={study_uid}")
        # HTTP 202 with Retry-After header tells client to poll again
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=pending.model_dump(),
            headers={"retry-after": "3"}
        )
    
    # --- Part 2. If dynamic_measurements_row is missing: check PanEcho+EchoPrime combined results pre-requisite ---
    panecho_echoprime_combined_row: Optional[DerivedResult] = (
    db.query(DerivedResult)
    .filter(
        DerivedResult.study_id == study.id,
        DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
    )
    .first()
    )

    is_panecho_echoprime_ready = (
        panecho_echoprime_combined_row and
        panecho_echoprime_combined_row.status == ResultStatus.complete
    )

    if not is_panecho_echoprime_ready:
        logger.info(
        f"[DYNAMIC_MEASUREMENTS_COMBINED] Waiting for PanEcho+EchoPrime combined results for study_uid={study_uid} "
        f"(panecho_echoprime_combined_row_status={getattr(panecho_echoprime_combined_row, 'status', None)})"
        )
        pending = PendingResponse(status="pending", retry_after=3)
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=pending.model_dump(),
            headers={"retry-after": "3"},
        )

    # --- Part 2. Not found -> trigger background task and return pending ---
    # --- Part 2.1 Try to create the 'pending' row as our idempotency marker ---
    created = False
    try: 
        new_row = DerivedResult(
            study_id = study.id,
            type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
            status=ResultStatus.pending,
            model_name="Dynamic_Measurements_Combined",
            model_version="v1",
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
        logger.info(f"[DYNAMIC_MEASUREMENTS_COMBINED] Orchestration and inference started for study_uid={study_uid}")
        background_tasks.add_task(combining_dynamic_measurements, study_uid)

    # --- Part 2.3 Return pending ---
    pending = PendingResponse(status="pending", retry_after=3)
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content=pending.model_dump(),
        headers={"retry-after": "3"}
    )
