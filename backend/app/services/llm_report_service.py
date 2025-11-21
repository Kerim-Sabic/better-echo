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
    report_text = client.chat_completion(
        messages=built["messages"],
        temperature=params.temperature_report,
        max_tokens=built["max_tokens"],
    )

    # --- Step 4: Post-process blocks ---
    blocks = extract_report_blocks(report_text)
    report_md = blocks.get("report_md") or report_text
    diagnoses_json = blocks.get("diagnoses_json")

    # --- Step 5: Write artifacts to uploads and persist ---
    # Compute uploads root: backend/app/uploads
    services_dir = os.path.dirname(os.path.abspath(__file__))
    uploads_root = os.path.normpath(os.path.join(services_dir, "..", "uploads"))
    out_dir = os.path.join(uploads_root, "llm_reports", study_uid)
    try:
        os.makedirs(out_dir, exist_ok=True)
    except Exception as e:
        logger.warning(f"[LLM] Failed to create uploads directory {out_dir}: {e}")

    # File paths (absolute)
    report_md_abs = os.path.join(out_dir, "AI_Report.md")
    diagnoses_json_abs = os.path.join(out_dir, "AI_Diagnoses.json")

    # Write files
    try:
        with open(report_md_abs, "w", encoding="utf-8") as f:
            f.write(report_md or "")
    except Exception as e:
        logger.warning(f"[LLM] Failed to write report MD file: {e}")
    try:
        with open(diagnoses_json_abs, "w", encoding="utf-8") as f:
            json.dump(diagnoses_json if diagnoses_json is not None else [], f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"[LLM] Failed to write diagnoses JSON file: {e}")

    # Relative paths (served under /uploads)
    def _rel_uploads(p: str) -> str:
        try:
            rp = os.path.relpath(p, uploads_root)
            return rp.replace("\\", "/")  # for Windows paths
        except Exception:
            return p
        
    report_md_rel = _rel_uploads(report_md_abs)
    diagnoses_json_rel = _rel_uploads(diagnoses_json_abs)

    payload = {
        "report_md": report_md,
        "report_md_file": report_md_rel,
        "diagnoses_json": diagnoses_json,
        "diagnoses_json_file": diagnoses_json_rel,
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
