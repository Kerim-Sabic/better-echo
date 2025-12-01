from __future__ import annotations

import json
import logging
import os
from typing import Optional, Dict, Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE, LLM_REPORT_TYPE
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_from_row
from app.services.llm_client import LLMClient
from app.prompting.params import LLMParams
from app.prompting.builder import build_report_messages, extract_report_blocks


logger = logging.getLogger(__name__)


def generate_for_study(study_uid: str, db: Session) -> Dict[str, Any]:
    """
    Generates an LLM report for a study using the combined sections as context.
    Persists a DerivedResult (LLM_Echo_Report) with report_md and diagnoses_json.
    Returns the response payload {study_uid, model, report, diagnoses_json}.
    Writes artifacts to uploads/llm_reports/{study_uid} and persists to DB.
    """
    # --- Step 1: Resolve study and combined row ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise ValueError("Study not found")

    combined_row: Optional[DerivedResult] = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE)
        .first()
    )
    if not combined_row or combined_row.status != ResultStatus.complete:
        raise RuntimeError("Combined results not ready for report generation")

    combined_sections = build_combined_sections_from_row(combined_row)

    # --- Step 2: Build messages ---
    params = LLMParams()
    built = build_report_messages(
        study_uid=study_uid,
        combined_sections=combined_sections,
        language="en",
        style="concise",
        params=params,
    )

    # --- Step 3: Call LLM ---
    client = LLMClient()
    # If LLM not ready, signal caller to retry later
    if not client.wait_until_ready():
        raise RuntimeError("LLM service not ready; retry later")
    report_text = client.chat_completion(
        messages=built["messages"],
        temperature=params.temperature_report,
        max_tokens=built["max_tokens"],
    )

    # --- Step 4: Post-process blocks ---
    blocks = extract_report_blocks(report_text)
    report_md = blocks.get("report_md") or report_text
    diagnoses_json = blocks.get("diagnoses_json")

    # --- Step 5: Persist artifacts to database ---

    payload = {
        "report_md": report_md,
        "diagnoses_json": diagnoses_json,
        "raw_text": blocks.get("raw_text") or report_text,
        "model": settings.LLM_MODEL,
        "prompt_version": params.prompt_version,
    }

    try:
        existing = (
            db.query(DerivedResult)
            .filter(DerivedResult.study_id == study.id, DerivedResult.type == LLM_REPORT_TYPE)
            .first()
        )
        if existing:
            existing.value_json = json.dumps(payload, ensure_ascii=False)
            existing.status = ResultStatus.complete
        else:
            dr = DerivedResult(
                study_id=study.id,
                type=LLM_REPORT_TYPE,
                value_json=json.dumps(payload, ensure_ascii=False),
                model_name="LLM_Report_Generator",
                model_version="v1",
                status=ResultStatus.complete,
            )
            db.add(dr)
        db.commit()
    except Exception as e:
        logger.warning(f"[LLM] Persisting LLM report failed: {e}")

    return {
        "study_uid": study_uid,
        "model": settings.LLM_MODEL,
        "report": report_md,
        "diagnoses_json": diagnoses_json,
    }
