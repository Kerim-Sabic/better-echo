from __future__ import annotations

import json
import logging
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE, ECHOPRIME_TYPE, LLM_REPORT_TYPE
from app.database.db import get_db
from app.models.studies import Study
from app.models.derived_results import DerivedResult, ResultStatus
from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_from_row
from app.schemas.llm_schemas import (
    LLMReportResponse,
    LLMChatRequest,
    LLMChatResponse,
)
from app.services.llm_client import LLMClient
from app.services.llm_report_service import generate_for_study
from app.prompting.params import LLMParams
from app.prompting.builder import build_chat_messages


logger = logging.getLogger(__name__)
router = APIRouter()


def _json_of(value: Any) -> Dict[str, Any]:
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except Exception:
        return {}


@router.post("/studies/{study_uid}/llm/report/generate", response_model=LLMReportResponse)
def generate_llm_report(study_uid: str, db: Session = Depends(get_db)):
    """
    Generate an AI echo report using the combined PanEcho+EchoPrime JSON as context.

    Steps
    1) Validate study + ensure combined results exist and are complete.
    2) Build a compact prompt from combined sections.
    3) Call the local OpenAI-compatible chat completions endpoint via LLMClient.
    4) Persist the generated report as a DerivedResult (LLM_Echo_Report).
    5) Return the report text.
    """
    # --- Step 1: Validate study and combined row ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    combined_row: Optional[DerivedResult] = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE)
        .first()
    )
    if not combined_row:
        raise HTTPException(status_code=409, detail="Combined results not available. Please trigger and wait for completion.")
    if combined_row.status != ResultStatus.complete:
        raise HTTPException(status_code=409, detail="Combined results are still pending. Retry shortly.")

    # Delegate to service (uses prompting template + extraction + persistence)
    try:
        result = generate_for_study(study_uid=study_uid, db=db)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM report generation failed: {e}")

    return LLMReportResponse(
        study_uid=study_uid,
        model=result.get("model", settings.LLM_MODEL),
        report=result.get("report", ""),
        diagnoses_json=result.get("diagnoses_json"),
    )


@router.post("/llm/chat", response_model=LLMChatResponse)
def chat_about_report(payload: LLMChatRequest, db: Session = Depends(get_db)):
    """
    Answer a user question about a study using the LLM with short context:
    - previously generated LLM report (if present), else EchoPrime report as fallback
    - diagnoses JSON from the combined results
    """
    study_uid = payload.study_uid

    # --- Step 1: Locate study and related artifacts ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    # Combined results (diagnoses JSON)
    combined_row: Optional[DerivedResult] = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE)
        .first()
    )
    if not combined_row or combined_row.status != ResultStatus.complete:
        raise HTTPException(status_code=409, detail="Combined results not ready for chat context")
    combined_sections = build_combined_sections_from_row(combined_row)

    # Prefer LLM-generated report if available
    report_row: Optional[DerivedResult] = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == LLM_REPORT_TYPE)
        .order_by(DerivedResult.id.desc())
        .first()
    )

    report_text: Optional[str] = None
    if report_row and report_row.value_json:
        report_text = _json_of(report_row.value_json).get("report")

    # Fallback: EchoPrime report stored in its DerivedResult
    if not report_text:
        ep_row: Optional[DerivedResult] = (
            db.query(DerivedResult)
            .filter(DerivedResult.study_id == study.id, DerivedResult.type == ECHOPRIME_TYPE)
            .first()
        )
        if ep_row and ep_row.value_json:
            report_text = _json_of(ep_row.value_json).get("report")

    if not report_text:
        report_text = "No prior report available. Use diagnoses JSON only."

    # --- Step 2: Build messages via builder ---
    params = LLMParams()
    # Extract diagnoses_json from saved LLM report if present
    diagnoses_json: Optional[List[Dict[str, Any]]] = None
    if report_row and report_row.value_json:
        try:
            parsed = _json_of(report_row.value_json)
            dj = parsed.get("diagnoses_json")
            if isinstance(dj, list):
                diagnoses_json = dj
        except Exception:
            diagnoses_json = None
    built = build_chat_messages(
        study_uid=study_uid,
        report_md=report_text,
        diagnoses_json=diagnoses_json,
        combined_sections=combined_sections,
        question=payload.question,
        history=[t.model_dump() for t in (payload.history or [])],
        params=params,
    )

    # --- Step 3: Call LLM ---
    client = LLMClient()
    try:
        answer = client.chat_completion(
            messages=built["messages"],
            temperature=params.temperature_chat,
            max_tokens=built["max_tokens"],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    return LLMChatResponse(study_uid=study_uid, answer=answer, model=settings.LLM_MODEL)
