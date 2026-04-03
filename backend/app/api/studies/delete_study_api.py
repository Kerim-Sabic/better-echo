import os
from shutil import rmtree

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging

from app.database.db import get_db
from app.database_models.patients import Patient
from app.database_models.studies import Study
from app.helpers.auth.authentication_functions import get_current_user_id
from app.services.integrations.orthanc_client import delete_study_from_orthanc
from app.schemas.studies.studies_schemas import StudyDeleteResponse
from app.core.artifacts import (
    LINEAR_MEASUREMENTS_UPLOAD_DIRNAME,
    MOTION_SEGMENTATION_UPLOAD_DIRNAME,
    REPORT_SUMMARY_UPLOAD_DIRNAME,
    SPECTRAL_MEASUREMENTS_UPLOAD_DIRNAME,
    UPLOAD_DIR,
)

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
def delete_study(
    study_id: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
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
    study = (
        db.query(Study)
        .filter(Study.id == study_id, Study.user_id == current_user_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    patient_id = study.patient_id

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

    for folder_name, label in (
        (MOTION_SEGMENTATION_UPLOAD_DIRNAME, "motion segmentation results folder"),
        (LINEAR_MEASUREMENTS_UPLOAD_DIRNAME, "linear measurements folder"),
        (SPECTRAL_MEASUREMENTS_UPLOAD_DIRNAME, "spectral measurements folder"),
        (REPORT_SUMMARY_UPLOAD_DIRNAME, "study reports folder"),
    ):
        _delete_folder_if_exists(os.path.join(UPLOAD_DIR, folder_name, study.study_uid), label)

    # --- Step 4: Delete study (and maybe patient) from database ---
    try:
        db.delete(study)
        db.flush()

        # Now check if patient has other studies
        remaining_studies = db.query(Study).filter(Study.patient_id == patient_id).count()
        if remaining_studies == 0:
            patient = db.query(Patient).filter(Patient.id == patient_id).first()
            if patient:
                db.delete(patient)
                logger.info(f"Patient {patient_id} deleted because they had no more studies")

        db.commit()
        logger.info(f"Study {study_id} deleted from database and Orthanc")
    except SQLAlchemyError as err:
        db.rollback()
        logger.error(f"Failed to delete study {study_id} from database: {str(err)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete study {study_id} from database after Orthanc deletion"
        )
    
    return {"ok": True, "message": "Study deleted from DB and Orthanc"}
