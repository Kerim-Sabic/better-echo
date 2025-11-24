import os

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import logging

from app.database.db import get_db
from app.database_models.studies import Study
from app.schemas.studies_schemas import (StudyListResponse)
from app.helpers.authentication_functions import get_current_user_id
from app.core.artifacts import UPLOAD_DIR

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/studies", response_model=StudyListResponse)
def list_studies(
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id)
):
    """
    Retrieves only the studies belonging to the logged-in user.
    """
    rows = (
        db.query(Study)
        .filter(Study.user_id == current_user_id)
        .order_by(Study.uploaded_at.desc())
        .all()
    )
    data = []

    for study in rows:
        study_dict = {
            "id": study.id,
            "study_uid": study.study_uid,
            "study_date": study.study_date,
            "description": study.description,
            "status": study.status,
            "uploaded_at": study.uploaded_at,
            "patient": {
                "id": study.patient.id,
                "patient_id": study.patient.patient_id,
                "patient_name": study.patient.patient_name,
                "patient_sex": study.patient.patient_sex,
                "patient_birth_date": study.patient.patient_birth_date,
            }
        }
        data.append(study_dict)

    return data