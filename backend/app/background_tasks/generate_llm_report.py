from __future__ import annotations
import logging

from app.database.db import SessionLocal
from app.models.studies import Study
from app.models.derived_results import DerivedResult, ResultStatus
from app.core.artifacts import LLM_REPORT_TYPE
from app.services.llm_report_service import generate_for_study

logger = logging.getLogger(__name__)

def generate_llm_report(study_uid: str) -> None:
    """
    Background entrypoint.
    - Uses its own DB session (no Depends()).
    - Calls your service generate_for_study(...).
    - On error, marks the LLM row as failed (if present).
    """
    db = SessionLocal()
    try:
        _ = generate_for_study(study_uid=study_uid, db=db)
        logger.info(f"[LLM_REPORT] Generated and persisted for study_uid={study_uid}")
    except Exception as err:
        logger.exception(f"[LLM_REPORT] Generation failed for {study_uid}: {err}")
        # Mark existing pending row failed
        try:
            study = db.query(Study).filter(Study.study_uid == study_uid).first()
            if study:
                row = (
                    db.query(DerivedResult)
                    .filter(DerivedResult.study_id == study.id, DerivedResult.type == LLM_REPORT_TYPE)
                    .first()
                )
                if row:
                    row.status = ResultStatus.failed
                    db.commit()
        except Exception:
            db.rollback()
    finally:
        try:
            db.close()
        except Exception:
            pass