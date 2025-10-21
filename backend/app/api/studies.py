import os
from typing import List
from shutil import rmtree

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging

from app.database.db import get_db
from app.models.studies import Study
from app.models.instances import Instance
from app.models.derived_results import DerivedResult
from app.services.orthanc_client import delete_study_from_orthanc
from app.schemas.studies_schemas import (StudyListResponse, 
                                        StudyDeleteResponse, 
                                        StudyUpdateResponse, 
                                        DerivedResultResponse,
                                        InstanceResponse)

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
    
    # Delete the entire local study folder
    study_folder = os.path.join(UPLOAD_DIR, study.study_uid)
    if os.path.exists(study_folder):
        try:
            rmtree(study_folder)
            logger.info(f"Deleted study folder {study_folder}")
        except Exception as err:
            logger.error(f"Failed to delete study folder {study_folder}: {str(err)}")
    else:
        logger.warning(f"Study folder {study_folder} not found")

    # Delete the LV segmentation files folder for the study_uid being deleted.
    lv_segmentation_folder = os.path.join(UPLOAD_DIR, "echonet_dynamic_LV-segmentation_files", study.study_uid)
    if os.path.exists(lv_segmentation_folder):
        try:
            rmtree(lv_segmentation_folder)
            logger.info(f"Deleted LV segmentation results folder {lv_segmentation_folder}")
        except Exception as err:
            logger.error(f"Failed to delete LV segmentation results folder {lv_segmentation_folder}: {str(err)}")
    else:
        logger.warning(f"LV segmentation results folder {lv_segmentation_folder} not found")
    
    # Delete EchoNet-Measurements files for all instances (videos/CSVs)
    try:
        uploads_measurements_root = os.path.join(UPLOAD_DIR, "measurements_2D_keypoint_detection")
        try:
            uploads_measurements_study = os.path.join(uploads_measurements_root, study.study_uid)
            if os.path.exists(uploads_measurements_study):
                rmtree(uploads_measurements_study)
                logger.info(f"Deleted uploads measurements folder {uploads_measurements_study}")
        except Exception as err:
            logger.error(f"Failed to delete uploads measurements folder: {str(err)}")
    except Exception as err:
        logger.error(f"Failed to delete measurements artifacts: {str(err)}")

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


@router.patch("/studies/{study_id}", response_model=StudyUpdateResponse)
def update_study(study_id: int, payload: dict, db: Session = Depends(get_db)):
    """
    Updates the study_date and the patient_name for the related study.
    """
    study = db.query(Study).get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # allow updating study_date
    if "study_date" in payload:
        study.study_date = payload["study_date"]

    # allow updating patient_name (via the related Patient model)
    if "patient_name" in payload and study.patient:
        study.patient.patient_name = payload["patient_name"]
    db.commit()
    return {"ok": True, "message": "Study information successfully updated"}


@router.get("/studies/{study_uid}/derived-results", response_model=List[DerivedResultResponse])
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
            "units": r.units,
            "model_name": r.model_name,
            "model_version": r.model_version,
            "created_at": r.created_at,
            "study_id": r.study_id,
            "instance_id": r.instance_id
        }
        for r in results
    ]

@router.get("/studies/{study_uid}/instances", response_model=List[InstanceResponse])
def list_instances(
    study_uid: str,
    db: Session = Depends(get_db)
):
    """
    List all instances for a given Study UID.
    """
    # --- Step 1. Find the study ---
    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail=f"Study with UID {study_uid} not found")

    # --- Step 2. Collect instances from all series under this study ---
    instances = (
        db.query(Instance)
        .join(Instance.series)
        .filter(Instance.series.has(study_id=study.id))
        .all()
    )

    return instances
