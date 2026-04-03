from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.artifacts import (
    COMBINED_ANALYSIS_TYPES,
    REPORT_SUMMARY_MODEL_NAME,
    REPORT_SUMMARY_TYPE,
    REPORT_SUMMARY_TYPES,
)
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_for_llm
from app.services.integrations.llm_client import LLMClient
from app.prompting.params import LLMParams
from app.prompting.builder import build_report_messages, extract_report_blocks


logger = logging.getLogger(__name__)


def generate_for_study(study_uid: str, db: Session) -> Dict[str, Any]:
    """
    Generates an LLM report for a study using the combined sections as context.
    Persists a report DerivedResult with report_md and diagnoses_json.
    Returns the response payload {study_uid, model, report, diagnoses_json}.
    Persists artifacts to the study reports store and to the database.
    """
    # --- Step 1: Resolve study and combined row ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise ValueError("Study not found")

    combined_row: Optional[DerivedResult] = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type.in_(COMBINED_ANALYSIS_TYPES))
        .first()
    )
    if not combined_row or combined_row.status != ResultStatus.complete:
        raise RuntimeError("Combined results not ready for report generation")

    combined_sections = build_combined_sections_for_llm(combined_row)

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
    report_text = client.chat_completion(
        messages=built["messages"],
        temperature=params.temperature_report,
        top_p=params.top_p_report,
        seed=params.seed_report,
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
        "model": REPORT_SUMMARY_MODEL_NAME,
        "prompt_version": params.prompt_version,
        "report_generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }

    try:
        existing = (
            db.query(DerivedResult)
            .filter(DerivedResult.study_id == study.id, DerivedResult.type.in_(REPORT_SUMMARY_TYPES))
            .first()
        )
        if existing:
            existing.value_json = payload
            existing.status = ResultStatus.complete
        else:
            dr = DerivedResult(
                study_id=study.id,
                type=REPORT_SUMMARY_TYPE,
                value_json=payload,
                model_name=REPORT_SUMMARY_MODEL_NAME,
                model_version="v1",
                status=ResultStatus.complete,
            )
            db.add(dr)
        db.commit()
    except Exception as e:
        logger.warning("[LLM] Persisting report failed: %s", e)

    return {
        "study_uid": study_uid,
        "model": REPORT_SUMMARY_MODEL_NAME,
        "report": report_md,
        "diagnoses_json": diagnoses_json,
        "report_generated_at": payload.get("report_generated_at"),
    }


__all__ = ["generate_for_study"]
