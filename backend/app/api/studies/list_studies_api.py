from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload
import logging

from app.database.db import get_db
from app.database_models.studies import Study
from app.schemas.studies.studies_schemas import StudyListResponse
from app.services.auth.principal_service import get_current_doctor_user_id
from app.core.artifacts import REPORT_SUMMARY_TYPE
from app.database_models.derived_results import ResultStatus
from app.helpers.pipeline.study_status import (
    compute_study_status,
    is_llm_enabled,
    status_by_type,
)

logger = logging.getLogger(__name__)
router = APIRouter()

def _parse_json(value: Any) -> Dict[str, Any]:
    """Return a dict payload when value_json is already structured JSON."""
    return value if isinstance(value, dict) else {}


@router.get("/studies", response_model=StudyListResponse)
def list_studies(
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_doctor_user_id)
):
    """
    Retrieve all studies belonging to the authenticated user.

    Steps:
    1. Read the authenticated user's ID from the JWT token.
    2. Query the database for Study rows where `user_id` matches the logged-in user.
    3. Order studies by upload timestamp (newest first).
    4. Serialize each study along with basic patient information.
    5. Return the filtered and formatted list of studies.
    """
    rows = (
        db.query(Study)
        .options(
            selectinload(Study.patient),
            selectinload(Study.derived_results),
        )
        .filter(Study.user_id == current_user_id)
        .order_by(Study.uploaded_at.desc())
        .all()
    )
    data = []
    llm_enabled = is_llm_enabled()

    for study in rows:
        derived_statuses = status_by_type(study.derived_results or [])
        effective_status = compute_study_status(llm_enabled, derived_statuses)

        diagnoses_list = []
        llm_result = next(
            (dr for dr in study.derived_results
             if dr.type == REPORT_SUMMARY_TYPE
             and dr.status == ResultStatus.complete
             and dr.value_json),
            None
        )

        if llm_result:
            try:
                parsed_value = _parse_json(llm_result.value_json)
                raw_diagnoses = parsed_value.get("diagnoses_json")

                if isinstance(raw_diagnoses, list):
                    diagnoses_list = [
                        d.get("label")
                        for d in raw_diagnoses
                        if isinstance(d, dict) and d.get("label")
                        ]
            except Exception as e:
                logger.warning(f"Failed to parse diagnoses for study {study.id}: {e}")

        study_dict = {
            "id": study.id,
            "study_uid": study.study_uid,
            "study_date": study.study_date,
            "description": study.description,
            "status": effective_status,
            "uploaded_at": study.uploaded_at,
            "patient": {
                "id": study.patient.id,
                "patient_id": study.patient.patient_id,
                "patient_name": study.patient.patient_name,
                "patient_sex": study.patient.patient_sex,
                "patient_birth_date": study.patient.patient_birth_date,
            },
            "diagnoses": diagnoses_list,
        }
        data.append(study_dict)

    return data

