from __future__ import annotations
import logging
import os
import time

from app.database.db import SessionLocal
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.core.artifacts import LLM_REPORT_TYPE
from app.services.llm_report_service import generate_for_study
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

# Grace period (seconds) to wait for LLM to come up before retrying
LLM_STARTUP_GRACE_SECONDS = float(os.getenv("LLM_STARTUP_GRACE_SECONDS", "120"))
LLM_READINESS_POLL_SECONDS = float(os.getenv("LLM_READINESS_POLL_SECONDS", "5"))


def _wait_for_llm_ready(timeout_seconds: float, poll_seconds: float) -> bool:
    client = LLMClient()
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if client.wait_until_ready(retries=1, delay_seconds=poll_seconds):
            return True
        time.sleep(poll_seconds)
    return False


def generate_llm_report(study_uid: str) -> None:
    """
    Background entrypoint.
    - Uses its own DB session (no Depends()).
    - Calls your service generate_for_study(...).
    - If LLM is still starting, waits up to a grace period before giving up.
    - On unrecoverable error, marks the LLM row as failed (if present).
    """
    db = SessionLocal()
    try:
        # Wait for LLM readiness with a grace period
        ready = _wait_for_llm_ready(
            timeout_seconds=LLM_STARTUP_GRACE_SECONDS,
            poll_seconds=LLM_READINESS_POLL_SECONDS,
        )
        if not ready:
            logger.warning(
                "[LLM_REPORT] LLM not ready after %.0fs; leaving pending for retry",
                LLM_STARTUP_GRACE_SECONDS,
            )
            return

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
