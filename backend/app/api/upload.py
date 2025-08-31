import os
from datetime import datetime

import aiofiles
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.services.orthanc_client import (
    send_dicom_to_orthanc,
    get_instance_tags,
    get_series_id_from_instance,
)
from app.database.db import SessionLocal
from app.models.study import Study

from app.schemas.upload_schemas import UploadDicomResponse

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = "app/uploads"

def _first(val, default=""):
    """
    Orthanc /instances/{id}/tags returns e.g. {"Value": ["ABC"]}.
    This helper returns the first string or a default.
    """
    if isinstance(val, list) and val:
        return str(val[0])
    if isinstance(val, (str, int, float)):
        return str(val)
    return default

def _tag(tags: dict, key: str, default=""):
    # tags like tags["0008,0020"] = {"Name": "StudyDate", "Value": ["YYYYMMDD"]}
    obj = tags.get(key, {})
    return _first(obj.get("Value"), default)

def _clean_for_ui(tags: dict) -> dict:
    """Build a friendly dict the frontend can use to prefill fields."""
    return {
        "PatientName": _tag(tags, "0010,0010", ""),
        "PatientID": _tag(tags, "0010,0020", ""),
        "PatientBirthDate": _tag(tags, "0010,0030", ""),
        "StudyDate": _tag(tags, "0008,0020", ""),
        "StudyTime": _tag(tags, "0008,0030", ""),
        "AccessionNumber": _tag(tags, "0008,0050", ""),
        "ReferringPhysicianName": _tag(tags, "0008,0090", ""),
        "StudyInstanceUID": _tag(tags, "0020,000d", ""),
    }

@router.post("/upload-dicom", response_model=UploadDicomResponse)
async def upload_dicom(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    file_location = os.path.join(UPLOAD_DIR, f"{ts}_{file.filename}")

    try:
        # 1) Save uploaded file
        async with aiofiles.open(file_location, "wb") as out:
            content = await file.read()
            await out.write(content)
        logger.info(f"File saved locally at {file_location}")

        # 2) Send to Orthanc
        instance_id = send_dicom_to_orthanc(file_location)
        logger.info(f"File uploaded to Orthanc. Instance ID: {instance_id}")

        # 3) Fetch tags from Orthanc
        tags = get_instance_tags(instance_id)
        logger.info(f"Retrieved tags from Orthanc for instance {instance_id}")

        # 4) Extract normalized fields (STRINGS only)
        patient_id = _tag(tags, "0010,0020", "Unknown")
        study_date = _tag(tags, "0008,0020", "")         # keep as YYYYMMDD string
        study_uid  = _tag(tags, "0020,000d", "Unknown")
        logger.info(f"Extracted Patient ID: {patient_id}, Study Date: {study_date}, Study UID: {study_uid}")

        # 5) Avoid duplicates
        db = SessionLocal()
        try:
            existing = db.query(Study).filter_by(instance_id=instance_id).first()
            if existing:
                logger.warning(f"Duplicate instance ID: {instance_id}. Skipping insert.")
                # Still return UI-friendly tags so the frontend can proceed
                series_id = get_series_id_from_instance(instance_id) or ""
                return {
                    "message": "File already exists in the database",
                    "filename": file.filename,
                    "instance_id": instance_id,
                    "study_uid": study_uid,
                    "series_id": series_id,
                    "tags": _clean_for_ui(tags),
                }

            # 6) Save to DB
            study = Study(
                instance_id=instance_id,
                patient_id=patient_id,
                study_uid=study_uid,
                study_date=study_date,
                file_path=file_location,
                status="processing",
            )
            db.add(study)
            db.commit()
            db.refresh(study)
            logger.info(f"Study saved to database. Instance ID: {instance_id}")
        finally:
            db.close()

        # 7) Include series_id for local viewer integration if needed
        series_id = get_series_id_from_instance(instance_id) or ""
        clean = _clean_for_ui(tags)
        logger.info(f"Cleaned tags for UI: {clean}")

        # 8) Return success with cleaned tags for the UI
        return {
            "message": "Upload successful",
            "filename": file.filename,
            "instance_id": instance_id,
            "study_uid": study_uid,
            "series_id": series_id,
            "tags": clean,
            # optionally echo patient info so UI can show it immediately
            "patient_id": clean.get("PatientID") or "Unknown",
            "study_date": clean.get("StudyDate") or None,
        }

    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
