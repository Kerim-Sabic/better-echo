import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.studies import Study
from app.schemas.studies.studies_schemas import StudySchema
from app.helpers.auth.authentication_functions import get_current_user_id
from app.helpers.pipeline.study_status import (
    compute_study_status,
    is_llm_enabled,
    status_by_type,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _study_to_dict(study: Study, *, status: str | None = None) -> StudySchema:
    return StudySchema.model_validate(
        {
            "id": study.id,
            "study_uid": study.study_uid,
            "study_date": study.study_date,
            "description": study.description,
            "status": status if status is not None else study.status,
            "uploaded_at": study.uploaded_at,
            "patient_height_cm": study.patient_height_cm,
            "patient_weight_kg": study.patient_weight_kg,
            "heart_rate_bpm": study.heart_rate_bpm,
            "patient": {
                "id": study.patient.id,
                "patient_id": study.patient.patient_id,
                "patient_name": study.patient.patient_name,
                "patient_sex": study.patient.patient_sex,
                "patient_birth_date": study.patient.patient_birth_date,
            },
            "diagnoses": None,
        }
    )


@router.get("/studies/{study_uid}", response_model=StudySchema)
def retrieve_study(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Retrieve a single study by UID for the authenticated user.

    Steps:
    1. Read the authenticated user's ID from the JWT token.
    2. Query the database for the Study row where `study_uid` and `user_id` match.
    3. Return the study serialized to the same shape as the list endpoint, or 404 if not found.
    """
    study = (
        db.query(Study)
        .filter(Study.study_uid == study_uid, Study.user_id == current_user_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    llm_enabled = is_llm_enabled()
    derived_statuses = status_by_type(study.derived_results or [])
    effective_status = compute_study_status(llm_enabled, derived_statuses)

    return _study_to_dict(study, status=effective_status)

