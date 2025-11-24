from __future__ import annotations
from typing import Optional, Dict, Any
import logging
import time
import json

from app.database.db import SessionLocal
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult, ResultStatus

from app.api.inference.infer_panecho_api import infer_panecho
from app.schemas.infer_panecho_schemas import InferPanEchoRequest
from app.api.inference.infer_echoprime_api import infer_echoprime
from app.schemas.infer_echoprime_schemas import InferEchoPrimeRequest

from app.core.artifacts import PANECHO_TYPE, ECHOPRIME_TYPE, PANECHO_ECHOPRIME_COMBINED_TYPE
from app.helpers.combine_panecho_echoprime_predictions import combine_results

logger = logging.getLogger(__name__)

def _json_to_dict_converter(derived_result: Optional[DerivedResult]) -> Dict[str, Any]:
    """Helper function that safely parses value_json to dict."""
    if not derived_result or derived_result.value_json is None:
        return {}
    if isinstance(derived_result.value_json, (dict, list)):
        return derived_result.value_json
    try:
        return json.loads(derived_result.value_json)
    except Exception:
        return {}


def combining_panecho_echoprime(study_uid: str):
    """
    Background orchestration (single pass, no staleness logic).

    Part 1. Check for PanEcho/EchoPrime derived results; if at least one missing
            run both inferences.
    Part 2. Gather sources from returned outputs or DB.
    Part 3. Combine and persist PanEcho_EchoPrime_Combined_Tasks
    """

    db = SessionLocal()
    try:
        # --- Part 1. Ensure sources exist (run both if at least one missing) ---
        study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
        if not study:
            logger.warning(f"[COMBINED] study not found: {study_uid}")
            return
        
        panecho_row = (
            db.query(DerivedResult)
            .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_TYPE)
            .first()
        )

        echoprime_row = (
            db.query(DerivedResult)
            .filter(DerivedResult.study_id == study.id, DerivedResult.type == ECHOPRIME_TYPE)
            .first()
        )

        panecho_output = None   # will hold {'study_uid','num_instances','predictions'}
        echoprime_output = None   # will hold {'study_uid','num_instances','predictions','report'}

        if not (panecho_row and echoprime_row):
            try:
                logger.info(f"[COMBINED] triggering both inferences for {study_uid} (at least one missing)")
                panecho_output = infer_panecho(payload=InferPanEchoRequest(study_uid=study_uid), db=db)
            except Exception as err:
                logger.exception(f"[COMBINED] infer_panecho failed: {err}")
            
            try:
                echoprime_output = infer_echoprime(payload=InferEchoPrimeRequest(study_uid=study_uid), db=db)
            except Exception as err:
                logger.exception(f"[COMBINED] infer_echoprime failed: {err}")
            
            # Give the DB a brief moment to flush/refresh rows written by inference
            time.sleep(0.5)
        
        # --- Part 2. Gather sources (from in-memory outputs; else read DB) ---
        if panecho_output and isinstance(panecho_output, dict):
            panecho_predictions = panecho_output.get("predictions", {}) or {}
        else:
            panecho_row = (
                db.query(DerivedResult)
                .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_TYPE)
                .first()
            )
            panecho_predictions = _json_to_dict_converter(panecho_row) or {}
        
        if echoprime_output and isinstance(echoprime_output, dict):
            echoprime_predictions = echoprime_output.get("predictions", {}) or {}
        else:
            echoprime_row = (
                db.query(DerivedResult)
                .filter(DerivedResult.study_id == study.id, DerivedResult.type == ECHOPRIME_TYPE)
                .first()
            )
            echoprime_predictions = _json_to_dict_converter(echoprime_row) or {}
            echoprime_predictions = echoprime_predictions.get("predictions") or {} # to get only the predictions key and not the report key

        # --- Part 2.1: If predictions are missing, bail; next GET will retry.
        if not panecho_predictions or not echoprime_predictions:
            logger.warning(f"[COMBINED] missing sources for {study_uid} (panecho={bool(panecho_predictions)}, ep={bool(echoprime_predictions)})")
            return
        
        # --- Part 3: Combine and persist to DB ---
        combined_results = combine_results(study_uid, panecho_predictions, echoprime_predictions)

        combined_row = (
            db.query(DerivedResult)
            .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE)
            .first()
        )

        if combined_row:
            combined_row.value_json = combined_results["integrated_tasks"]
            combined_row.status = ResultStatus.complete
        else:
            combined_row = DerivedResult(
                study_id = study.id,
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                value_json = combined_results["integrated_tasks"],
                model_name = "PanEcho_EchoPrime_Combined",
                model_version = "v1",
                status = ResultStatus.complete
            )
            db.add(combined_row)

        db.commit()
        logger.info(f"[COMBINED] Combined_Results persisted for study {study_uid}")

    # --- Part 4. If an error occurs, change the combined results row status to failed ---
    except Exception as err:
        logger.exception(f"[COMBINED] Orchestration failed for {study_uid}: {err}")
        try:
            # Try to mark the row as failed
            study = db.query(Study).filter(Study.study_uid == study_uid).first()
            if study:
                row = (
                    db.query(DerivedResult)
                    .filter(DerivedResult.study_id == study.id, DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE)
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
