from __future__ import annotations
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.artifacts import COMBINED_ANALYSIS_TYPE, REPORT_SUMMARY_MODEL_NAME
from app.database.db import get_db
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.schemas.llm.llm_schemas import LLMReportResponse
from app.services.reporting.llm_report_service import generate_for_study


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/studies/{study_uid}/llm/report/generate", response_model=LLMReportResponse)
def generate_llm_report(study_uid: str, db: Session = Depends(get_db)):
    """
    Generate and persist an AI echo report for a study using the combined study analysis results.

    Steps:
    1. Resolve the study by `study_uid` and ensure a combined study analysis DerivedResult row exists.
    2. Validate that the combined row is complete; otherwise return a 409 indicating pending results.
    3. Delegate to `generate_for_study` to build the prompt, call the LLM, and persist the LLM report DerivedResult.
    4. Return an `LLMReportResponse` with the study UID, model, report text, and diagnoses JSON (if present).
    """
    # --- Step 1: Validate study and combined row ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    combined_row: Optional[DerivedResult] = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == COMBINED_ANALYSIS_TYPE)
        .first()
    )
    if not combined_row:
        raise HTTPException(status_code=409, detail="Combined results not available. Please trigger and wait for completion.")
    if combined_row.status != ResultStatus.complete:
        raise HTTPException(status_code=409, detail="Combined results are still pending. Retry shortly.")

    # --- Step 2: Delegate to report generation service ---
    try:
        result = generate_for_study(study_uid=study_uid, db=db)
    except Exception as e:
        raise HTTPException(status_code=502, detail="LLM report generation failed")

    # --- Step 3: Return generated report ---
    return LLMReportResponse(
        study_uid=study_uid,
        model=result.get("model", REPORT_SUMMARY_MODEL_NAME),
        report=result.get("report", ""),
        diagnoses_json=result.get("diagnoses_json"),
        report_generated_at=result.get("report_generated_at"),
    )
