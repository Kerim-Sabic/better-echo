from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db

from app.database_models.studies import Study
from app.schemas.patients.patients_schemas import PatientBase

router = APIRouter()

@router.get("/{study_uid}/patient", response_model=PatientBase)
def get_patient_by_study_uid(study_uid: str, db: Session = Depends(get_db)):
    """
    Retrieve patient information associated with a specific study UID.

    Steps:
    1. Accept the `study_uid` identifying the target echocardiography study.
    2. Query the database to locate the corresponding Study row.
    3. If no study exists with that UID, return a 404 Not Found response.
    4. Access the related Patient record through the Study relationship.
    5. Serialize and return key patient demographic details.
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
