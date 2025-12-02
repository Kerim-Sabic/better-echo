from __future__ import annotations
import json
import logging
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE, ECHOPRIME_TYPE, LLM_REPORT_TYPE
from app.database.db import get_db
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_from_row
from app.schemas.llm.llm_schemas import (
    LLMChatRequest,
    LLMChatResponse,
)
from app.services.llm_client import LLMClient
from app.prompting.params import LLMParams
from app.prompting.builder import build_chat_messages


logger = logging.getLogger(__name__)
router = APIRouter()


def _json_of(value: Any) -> Dict[str, Any]:
    """Best-effort JSON parser that returns an empty dict on falsy or invalid input."""
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except Exception:
        return {}

@router.post("/llm/chat", response_model=LLMChatResponse)
def chat_about_report(payload: LLMChatRequest, db: Session = Depends(get_db)):
    """
    Answer a user question about a study using the LLM with short context from a prior report and diagnoses JSON.

    Steps:
    1. Resolve the study by `study_uid` and fetch the combined PanEcho+EchoPrime results row; return 409 if not complete.
    2. Prefer an existing LLM-generated report; otherwise use a generic fallback text.
    3. Optionally extract `diagnoses_json` from the saved LLM report, if present.
    4. Use `build_chat_messages` to construct the LLM chat messages with report, diagnoses, combined sections, and the question.
    5. Call the LLM via `LLMClient.chat_completion` and return the answer with the model name.
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
