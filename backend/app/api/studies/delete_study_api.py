import os
from shutil import rmtree

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging

from app.database.db import get_db
from app.database_models.studies import Study
from app.services.orthanc_client import delete_study_from_orthanc
from app.schemas.studies_schemas import StudyDeleteResponse
from app.core.artifacts import UPLOAD_DIR

logger = logging.getLogger(__name__)
router = APIRouter()


def _delete_folder_if_exists(path: str, label: str) -> None:
    if os.path.exists(path):
        try:
            rmtree(path)
            logger.info(f"Deleted {label} {path}")
        except Exception as err:
            logger.error(f"Failed to delete {label} {path}: {err}")
    else:
        logger.warning(f"{label} {path} not found")

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