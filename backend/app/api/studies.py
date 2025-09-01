import os

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging

from app.database.db import get_db
from app.models.studies import Study
from app.models.patients import Patient
from app.models.derived_results import DerivedResult
from app.services.orthanc_client import delete_study_from_orthanc
from app.schemas.studies_schemas import StudyListResponse, StudyDeleteResponse

logger = logging.getLogger(__name__)

router = APIRouter()
UPLOAD_DIR = "app/uploads"

@router.get("/studies", response_model=StudyListResponse)
def list_studies(db: Session = Depends(get_db)):
    """
    Retrieves all studies with patient info
    """
    rows = db.query(Study).order_by(Study.uploaded_at.desc()).all()
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

@router.delete("/studies/{study_id}", response_model=StudyDeleteResponse)
def delete_study(study_id: int, db: Session = Depends(get_db)):
    """
    Deletes the study from both the database and the orthanc server.
    Deletes all instances for that study from the app/uploads folder.
    Deletes the patient related to that study from the database, if that
    patient has no more studies in the database (this mimics the orthanc
    server behavior and keeps orthanc server and database consistent).
    """
    study = db.query(Study).get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    patient = study.patient # get related patient
    
    # Delete from Orthanc first using orthanc_id
    if study.study_orthanc_id:
        deleted = delete_study_from_orthanc(study.study_orthanc_id)
        if not deleted:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete study {study_id} from Orthanc. Database not modified."
            )
    
    # Delete all instance files for the study from app/uploads folder
    for series in study.series:
        for instance in series.instances:
            if instance.file_path and os.path.exists(instance.file_path):
                try:
                    os.remove(instance.file_path)
                    logger.info(f"Deleted file {instance.file_path}")
                except Exception as err:
                    logger.error(f"Failed to delte file {instance.file_path}: {str(err)}")
            else:
                logger.warning(f"File {instance.file_path} not found")


    # Delete from Database
    try:
        db.delete(study)
        db.commit()

        # Now check if patient has other studies
        remaining_studies = db.query(Study).filter(Study.patient_id == patient.id).count()
        if remaining_studies == 0:
            db.delete(patient)
            db.commit()
            logger.info(f"Patient {patient.id} deleted because they had no more studies")

        logger.info(f"Study {study_id} deleted from database and Orthanc")
    except SQLAlchemyError as err:
        db.rollback()
        logger.error(f"Failed to delete study {study_id} from database: {str(err)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete study {study_id} from database after Orthanc deletion"
        )
    
    return {"ok": True, "message": "Study deleted from DB and Orthanc"}


@router.patch("/studies/{study_id}")
def update_study(study_id: int, payload: dict, db: Session = Depends(get_db)):
    s = db.query(Study).get(study_id)
    if not s:
        raise HTTPException(status_code=404, detail="Study not found")
    # allow light edits
    for key in ["patient_id", "study_date"]:
        if key in payload:
            setattr(s, key, payload[key])
    if "notes" in payload and hasattr(s, "notes"):
        s.notes = payload["notes"]
    db.commit()
    return {"ok": True}


@router.get("/studies/{study_uid}/derived-results")
def list_derived_results(study_uid: str, db: Session = Depends(get_db)):
    """
    Lists the derived results of the study from the database
    """
    s = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not s:
        raise HTTPException(status_code=404, detail="Study not found")
    
    results = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == s.id)
        .order_by(DerivedResult.created_at.desc())
        .all()
    )

    return [
        {
            "id": r.id,
            "type": r.type,
            "value_numeric": r.value_numeric,
            "value_json": r.value_json,
            "created_at": r.created_at,
        }
        for r in results
    ]
