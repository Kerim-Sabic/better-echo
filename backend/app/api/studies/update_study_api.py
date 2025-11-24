from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from app.database.db import get_db
from app.database_models.studies import Study
from app.schemas.studies_schemas import StudyUpdateResponse

logger = logging.getLogger(__name__)
router = APIRouter()


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