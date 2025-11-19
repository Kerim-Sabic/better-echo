from __future__ import annotations
from typing import Optional
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database.db import get_db
from app.models.studies import Study
from app.models.derived_results import DerivedResult, ResultStatus
from app.core.artifacts import (
    PANECHO_ECHOPRIME_COMBINED_TYPE,
    LLM_REPORT_TYPE,
)
from app.background_tasks.generate_llm_report import (
    generate_llm_report,
)
from app.helpers.row_to_dict.llm_report_row_to_dict import (
    build_llm_report_from_row,
)
from app.schemas.orchestration_apis_schemas.llm_report_get_api_schemas import (
    LLMReportResponse,
    LLMCompleteResponse,
    LLMPendingResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/studies/{study_uid}/llm-report-results",
            response_model=LLMReportResponse,)
def get_llm_report(
    study_uid: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Return the LLM report for a study, enqueue generation when prerequisites are met, or return pending status.

    Steps:
    1. Resolve the study by `study_uid` and look up any existing LLM report DerivedResult row.
    2. If a complete LLM report exists, convert it to a payload and return a 200 `LLMCompleteResponse`.
    3. If a pending/failed LLM report exists, return a 202 `LLMPendingResponse` with a `Retry-After` header, without enqueuing again.
    4. If there is no LLM report, check the PanEcho+EchoPrime combined results row; if missing or not complete, return 202 pending without enqueuing.
    5. When combined results are complete, create a pending LLM report row as an idempotency marker and enqueue the background `generate_llm_report` task.
    6. Return a 202 `LLMPendingResponse` with a `Retry-After` header so the client can poll for completion.
    """
    # --- Part 1: Lookup study ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # --- Part 2: Lookup LLM report row ---
    llm_report_row: Optional[DerivedResult] = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == LLM_REPORT_TYPE)
        .first()
    )

    # --- Part 3: If LLM report is present and complete -> return payload ---
    if llm_report_row and llm_report_row.status == ResultStatus.complete:
        payload = build_llm_report_from_row(llm_report_row)

        logger.info(f"[LLM_REPORT] LLM report present for study_uid={study_uid}")
        return LLMCompleteResponse(status="complete", llm_report=payload)
    
    # --- Part 4: If LLM report present but pending/failed -> pending (don't enqueue) ---
    if llm_report_row and llm_report_row.status in (ResultStatus.pending, ResultStatus.failed):
        pending = LLMPendingResponse(status="pending", retry_after=3)

        logger.info(
            f"[LLM_REPORT] LLM report in progress (status={llm_report_row.status}) for study_uid={study_uid}"
        )
        # HTTP 202 with Retry-After header tells client to poll again
        return JSONResponse(
            status_code=202,
            content=pending.model_dump(),
            headers={"retry-after": "3"},
        )
    
    # --- Part 5: If LLM report is missing, check PanEcho+EchoPrime combined results pre-requisite ---
    panecho_echoprime_combined_row: Optional[DerivedResult] = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == study.id,
            DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
        )
        .first()
    )

    if (not panecho_echoprime_combined_row) or (panecho_echoprime_combined_row.status != ResultStatus.complete):
        logger.info(
            f"[LLM_REPORT] Waiting for PanEcho+EchoPrime combined results for study_uid={study_uid} "
            f"(panecho_echoprime_combined_row_status={getattr(panecho_echoprime_combined_row, 'status', None)})"
        )
        pending = LLMPendingResponse(status="pending", retry_after=3)
        # HTTP 202 with Retry-After header tells client to poll again
        return JSONResponse(
            status_code=202,
            content=pending.model_dump(),
            headers={"retry-after": "3"},
        )
    
    # --- Part 6: If combined results are COMPLETE; create pending LLM row and enqueue ---
    created = False
    try:
        new_row = DerivedResult(
            study_id=study.id,
            type=LLM_REPORT_TYPE,
            status=ResultStatus.pending,
            model_name="LLM_Report_Generator",
            model_version="v1",
        )
        db.add(new_row)
        db.commit()
        created = True
    except IntegrityError:
        db.rollback()
        # Another process inserted the pending row in between our SELECT and INSERT.
        # Treat as pending; do NOT enqueue again.
    
    if created:
        logger.info(f"[LLM_REPORT] Enqueuing LLM report generation for study_uid={study_uid}")
        # Background task should:
        #  - read the PanEcho+EchoPrime combined results for this study
        #  - run the LLM generation
        #  - update the LLM DerivedResult row to COMPLETE + persist payload (JSON)
        background_tasks.add_task(generate_llm_report, study_uid)
    
    # Return pending either way (idempotent)
    pending = LLMPendingResponse(status="pending", retry_after=3)
    return JSONResponse(
        status_code=202,
        content=pending.model_dump(),
        headers={"retry-after": "3"},
    )
