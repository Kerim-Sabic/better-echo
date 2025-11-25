from __future__ import annotations
from typing import Optional
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database.db import get_db
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE
from app.background_tasks.combining_panecho_echoprime import combining_panecho_echoprime
from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_from_row
from app.schemas.orchestration_apis.combined_panecho_echoprime_schemas import (
    CombinedResultsResponse, CompleteResponse, PendingResponse
)

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
        
    
    # --- Part 1.2: If present but not complete -> pending (DON'T enqueue again) ---
    if combined_results_row and combined_results_row.status in (
        ResultStatus.pending, ResultStatus.failed
    ):
        pending = PendingResponse(status="pending", retry_after=3)

        logger.info(f"[COMBINED_RESULTS] inferences and orchestration is running for study_uid: {study_uid}")

        # HTTP 202 with Retry-After header tells client to poll again
        return JSONResponse(
            status_code=202,
            content=pending.model_dump(),
            headers={"retry-after": "3"}
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
