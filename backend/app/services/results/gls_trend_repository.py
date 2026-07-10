"""
Cross-study GLS history gathering for the longitudinal bullseye trend.

Thin DB layer: it collects the latest complete combined-analysis row per study
for the study's patient, then delegates the ordering/extraction to the pure
``build_gls_trend_points`` builder (which is unit-tested without a DB).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from sqlalchemy.orm import Session, selectinload

from app.core.artifacts import COMBINED_ANALYSIS_TYPES
from app.database_models.derived_results import ResultStatus
from app.database_models.studies import Study
from app.helpers.row_to_dict.combined_results_row_to_dict import (
    extract_combined_payload_parts,
)
from app.services.pipeline.read import get_active_or_legacy_result_row
from app.services.results.gls_bullseye import build_gls_trend_points

logger = logging.getLogger(__name__)


def _patient_sex_for_study(study: Study) -> Any:
    patient = getattr(study, "patient", None)
    raw_sex = getattr(patient, "patient_sex", None)
    return raw_sex if isinstance(raw_sex, str) and raw_sex.strip() else None


def build_patient_gls_trend(db: Session, study: Study) -> List[Dict[str, Any]]:
    """
    Build the longitudinal GLS trend across every study of this study's patient.

    Uses the most recent complete combined-analysis row per study. Failures are
    swallowed to a no-op trend so the bullseye never breaks the results page.
    """
    try:
        patient_id = getattr(study, "patient_id", None)
        if patient_id is None:
            return []

        studies = (
            db.query(Study)
            .options(selectinload(Study.patient))
            .filter(Study.patient_id == patient_id, Study.user_id == study.user_id)
            .order_by(Study.study_date.asc(), Study.uploaded_at.asc(), Study.id.asc())
            .all()
        )

        entries: List[Dict[str, Any]] = []
        for study_row in studies:
            derived_row = get_active_or_legacy_result_row(
                db=db,
                study_id=study_row.id,
                result_type=COMBINED_ANALYSIS_TYPES,
            )
            if derived_row is None or derived_row.status != ResultStatus.complete:
                continue
            integrated_tasks, overrides, _updated_at = extract_combined_payload_parts(
                derived_row.value_json
            )
            entries.append(
                {
                    "study_uid": study_row.study_uid,
                    "study_date": study_row.study_date,
                    "uploaded_at": study_row.uploaded_at,
                    "integrated_tasks": integrated_tasks,
                    "overrides": overrides,
                    "patient_sex": _patient_sex_for_study(study_row),
                }
            )

        return build_gls_trend_points(entries)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("[GLS_BULLSEYE] Failed to build patient GLS trend: %s", exc)
        return []


__all__ = ["build_patient_gls_trend"]
