from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db

from app.models.studies import Study
from app.schemas.patients_schemas import PatientBase

router = APIRouter()

@router.get("/{study_uid}/patient", response_model=PatientBase)
def get_patient_by_study_uid(study_uid: str, db: Session = Depends(get_db)):
    """
    Input study_uid to get all the data about the patient for that study_uid.
    """

    # Find study
    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    return {
        "study_uid": study.study_uid,
        "patient_id": study.patient.patient_id,
        "patient_name": study.patient.patient_name,
        "patient_sex": study.patient.patient_sex,
        "patient_birth_date": study.patient.patient_birth_date
    }
