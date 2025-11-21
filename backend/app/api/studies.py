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
from app.helpers.authentication_functions import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/app/api
UPLOAD_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "uploads"))  # backend/app/uploads


def _delete_folder_if_exists(path: str, label: str) -> None:
    if os.path.exists(path):
        try:
            rmtree(path)
            logger.info(f"Deleted {label} {path}")
        except Exception as err:
            logger.error(f"Failed to delete {label} {path}: {err}")
    else:
        logger.warning(f"{label} {path} not found")

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

@router.delete("/studies/{study_id}", response_model=StudyDeleteResponse)
def delete_study(study_id: int, db: Session = Depends(get_db)):
    """
    Delete a study from Orthanc, local uploads, and the database; delete the patient if they have no remaining studies.

    Steps:
    1. Resolve the study by ID and its related patient, or 404 if not found.
    2. If present, delete the corresponding study from Orthanc using `study_orthanc_id`.
    3. Delete local artifacts under `app/uploads` for the study, LV segmentation, 2D measurements, and LLM reports.
    4. Remove the study from the database and, if it was the patient's last study, delete the patient row.
    5. Commit changes and return a confirmation payload.
    """
    # --- Step 1: Resolve study and related patient ---
    study = db.query(Study).get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    patient = study.patient # get related patient
    
    # --- Step 2: Delete from Orthanc first using study_orthanc_id ---
    if study.study_orthanc_id:
        deleted = delete_study_from_orthanc(study.study_orthanc_id)
        if not deleted:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete study {study_id} from Orthanc. Database not modified."
            )
    
    # --- Step 3: Delete local artifacts under uploads ---
    study_folder = os.path.join(UPLOAD_DIR, study.study_uid)
    _delete_folder_if_exists(study_folder, "study folder")

    lv_segmentation_folder = os.path.join(
        UPLOAD_DIR,
        "echonet_dynamic_LV-segmentation_files",
        study.study_uid,
    )
    _delete_folder_if_exists(lv_segmentation_folder, "LV segmentation results folder")

    uploads_measurements_study = os.path.join(
        UPLOAD_DIR,
        "measurements_2D_keypoint_detection",
        study.study_uid,
    )
    _delete_folder_if_exists(uploads_measurements_study, "uploads measurements folder")

    llm_reports_study = os.path.join(
        UPLOAD_DIR,
        "llm_reports",
        study.study_uid,
    )
    _delete_folder_if_exists(llm_reports_study, "LLM reports folder")

    # --- Step 4: Delete study (and maybe patient) from database ---
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
    Update the `study_date` and/or the patient name for a given study.

    Steps:
    1. Fetch the study by ID or return 404 if it does not exist.
    2. If present in the payload, update `study_date` on the Study row.
    3. If present in the payload and a patient exists, update the Patient's `patient_name`.
    4. Commit the transaction and return a success message.
    """
    # --- Step 1: Fetch study or 404 ---
    study = db.query(Study).get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # --- Step 2: Apply updates from payload ---
    # allow updating study_date
    if "study_date" in payload:
        study.study_date = payload["study_date"]

    # allow updating patient_name (via the related Patient model)
    if "patient_name" in payload and study.patient:
        study.patient.patient_name = payload["patient_name"]

    # --- Step 3: Commit changes ---
    db.commit()
    return {"ok": True, "message": "Study information successfully updated"}


@router.get("/studies/{study_uid}/derived-results", response_model=List[DerivedResultResponse])
def list_derived_results(study_uid: str, db: Session = Depends(get_db)):
    """
    List derived results for a study from the database.

    Steps:
    1. Resolve the study by `study_uid` or return 404 if not found.
    2. Query all DerivedResult rows for that study ordered by `created_at` descending.
    3. Map each row into a dictionary that matches `DerivedResultResponse` and return the list.
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
            "status": r.status.value if r.status is not None else None,
            "value_json": r.value_json,
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

    Steps:
    1. Resolve the study by `study_uid` or return 404 if not found.
    2. Query all Instance rows for series that belong to that study.
    3. Return the list of instances, which Pydantic maps into `InstanceResponse` objects.
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
