from __future__ import annotations
import os
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.derived_results import ResultStatus
from app.core.artifacts import LLM_REPORT_TYPE
from app.helpers.auth.authentication_functions import get_current_user_id
from app.helpers.row_to_dict.llm_report_row_to_dict import build_llm_report_from_row
from app.schemas.results.llm_report_get_api_schemas import (
    LLMReportResponse,
    LLMCompleteResponse,
    LLMPendingResponse,
    LLMFailedResponse,
)
from app.services.pipeline.read import (
    get_result_row_for_read_mode,
    get_latest_stage_failure_detail,
    get_study_or_404,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/studies/{study_uid}/llm-report-results",
    response_model=LLMReportResponse,
)
def get_llm_report(
    study_uid: str,
    preview: bool = Query(False, description="Return latest draft artifacts when available"),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Observer-only LLM report endpoint.

    Steps:
    1. Resolve study and enforce LLM-enabled policy.
    2. Read preview/active (or legacy fallback) LLM row.
    3. Return complete/failed/pending with no enqueue side effects.
    """
    # Part 1. Resolve study and LLM feature gate.
    study = get_study_or_404(db=db, study_uid=study_uid, user_id=current_user_id)
    enable_llm = os.getenv("ENABLE_LLM", "true").lower() == "true"
    if not enable_llm:
        raise HTTPException(status_code=404, detail="LLM report disabled")

    # Part 2. Resolve preview-aware LLM row.
    llm_report_row = get_result_row_for_read_mode(
        db=db,
        study_id=study.id,
        result_type=LLM_REPORT_TYPE,
        preview=preview,
    )

    if llm_report_row and llm_report_row.status == ResultStatus.complete:
        payload = build_llm_report_from_row(llm_report_row)
        return LLMCompleteResponse(status="complete", llm_report=payload)

    if llm_report_row and llm_report_row.status == ResultStatus.failed:
        detail = None
        if isinstance(llm_report_row.value_json, dict):
            detail = llm_report_row.value_json.get("error")
        failed = LLMFailedResponse(status="failed", detail=detail or "LLM report generation failed")
        return JSONResponse(status_code=200, content=failed.model_dump())

    # Part 3. Queue-stage failure fallback for pending-with-error disambiguation.
    queue_failed_detail = get_latest_stage_failure_detail(
        db=db,
        study_id=study.id,
        stage_names=["combined", "dynamic_measurements", "llm"],
    )
    if queue_failed_detail:
        failed = LLMFailedResponse(status="failed", detail=queue_failed_detail)
        return JSONResponse(status_code=200, content=failed.model_dump())

    # Part 4. Observer-only pending response (no enqueue/marker writes).
    pending = LLMPendingResponse(status="pending", retry_after=3)
    return JSONResponse(
        status_code=202,
        content=pending.model_dump(),
        headers={"retry-after": "3"},
    )
