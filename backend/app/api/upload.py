import os
from datetime import datetime
from io import BytesIO

import aiofiles
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
import pydicom

from app.services.orthanc_client import (
    send_dicom_to_orthanc,
    get_instance_tags
)

from app.database.db import get_db
from app.models.patients import Patient
from app.models.studies import Study
from app.models.series import Series
from app.models.instances import Instance
from app.schemas.upload_schemas import UploadDicomResponseSchema
from app.helpers.authentication_functions import get_current_user_id

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
        "PatientSex": _tag(tags, "0010,0040", ""),
        "StudyDate": _tag(tags, "0008,0020", ""),
        "StudyTime": _tag(tags, "0008,0030", ""),
        "AccessionNumber": _tag(tags, "0008,0050", ""),
        "ReferringPhysicianName": _tag(tags, "0008,0090", ""),
        "StudyInstanceUID": _tag(tags, "0020,000d", ""),
        "SeriesInstanceUID": _tag(tags, "0020,000e", ""),
        "SOPInstanceUID": _tag(tags, "0008,0018", ""),
        "Modality": _tag(tags, "0008,0060", ""),
    }

@router.post("/upload-dicom", response_model=UploadDicomResponseSchema)
async def upload_dicom(file: UploadFile = File(...),
                       db: Session = Depends(get_db),
                       current_user_id: int = Depends(get_current_user_id)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    file_location = None

    try:
        # --- Step 1: read uploaded file in memory ---
        content = await file.read()

        # --- Step 2: read StudyUID from DICOM bytes ---
        try:
            ds = pydicom.dcmread(BytesIO(content), stop_before_pixels=True)
            study_uid = ds.StudyInstanceUID
        except Exception as err:
            raise HTTPException(status_code=400, detail=f"Invalid DICOM file: {str(err)}")
        
        # --- Step 3: create study specific folder ---
        study_folder = os.path.join(UPLOAD_DIR, study_uid)
        os.makedirs(study_folder, exist_ok=True)

        # --- Step 4: save file directly in study folder ---
        file_location = os.path.join(study_folder, f"{ts}_{file.filename}")
        async with aiofiles.open(file_location, "wb") as out:
            await out.write(content)
        logger.info(f"File saved at {file_location}")

        # --- Step 5: send to Orthanc ---
        upload_response = send_dicom_to_orthanc(file_location)

        # Reject duplicates
        if upload_response.get("Status") == "AlreadyStored":
            logger.warning("Duplicate upload attempt: DICOM already stored in Orthanc")
            
            # Delete the local file to avoid incosistencies
            if os.path.exists(file_location):
                os.remove(file_location)
                logger.info(f"Deleted local duplicate file at {file_location}")

            raise HTTPException(
                status_code=400,
                detail="This DICOM file has already been uploaded and is stored in Orthanc."
            )
        logger.info(f"File uploaded to Orthanc. Upload response: {upload_response}")

        instance_orthanc_id = upload_response["ID"]

        # --- Step 6: Fetch tags ---
        instance_tags = get_instance_tags(instance_orthanc_id)
        clean_instance_tags = _clean_for_ui(instance_tags)
        logger.info(f"Retrieved tags from Orthanc for instance {instance_orthanc_id}")

        # Extract identifiers
        patient_id_tag = clean_instance_tags["PatientID"] or "Unknown"
        study_uid = clean_instance_tags["StudyInstanceUID"]
        series_uid = clean_instance_tags["SeriesInstanceUID"]
        sop_instance_uid = clean_instance_tags["SOPInstanceUID"] # Dicom Instance UID

        logger.info(f"Extracted Patient ID tag: {patient_id_tag}, Study UID: {study_uid}, Series UID: {series_uid}, Dicom Instance UID: {sop_instance_uid}")

        # --- Step 7: Insert/Fetch Patient ---
        patient = db.query(Patient).filter_by(patient_id=patient_id_tag).first()
        if not patient:
            patient = Patient(
                patient_id = patient_id_tag,
                patient_name = clean_instance_tags["PatientName"],
                patient_sex = clean_instance_tags["PatientSex"],
                patient_birth_date = clean_instance_tags["PatientBirthDate"],
                patient_orthanc_id = upload_response["ParentPatient"]
            )
            db.add(patient)
            db.flush()
        
        # --- Step 8: Insert/Fetch Study ---
        study = db.query(Study).filter_by(study_uid=study_uid).first()
        if not study:
            study = Study(
                study_uid=study_uid,
                study_date = clean_instance_tags["StudyDate"],
                description=None,
                patient=patient,
                study_orthanc_id = upload_response["ParentStudy"],
                user_id = current_user_id

            )
            db.add(study)
            db.flush()

        # --- Step 9: Insert/Fetch Series ---
        series = db.query(Series).filter_by(series_uid=series_uid).first()
        if not series:
            series = Series(
                series_uid=series_uid,
                modality=clean_instance_tags["Modality"],
                description=None,
                study=study,
                series_orthanc_id = upload_response["ParentSeries"]
            )
            db.add(series)
            db.flush()

        # --- Step 10: Insert Instance ---
        existing_instance = db.query(Instance).filter_by(sop_instance_uid=sop_instance_uid).first()
        if existing_instance:
            raise HTTPException(status_code=400, detail="This DICOM instance already exists in the database")

        instance = Instance(
            sop_instance_uid=sop_instance_uid,
            file_path=file_location,
            instance_orthanc_id=instance_orthanc_id,
            series=series,
        )
        db.add(instance)
        db.commit()

        logger.info(f"Successfully stored Patient={patient_id_tag}, Study={study_uid}, Series={series_uid}, Instance={sop_instance_uid}")

        return {
            "message": "Upload successful",
            "filename": file.filename,
            "patient_id": patient_id_tag,
            "study_uid": study_uid,
            "series_uid": series_uid,
            "sop_instance_uid": sop_instance_uid,
            "tags": clean_instance_tags,
            "study_date": clean_instance_tags["StudyDate"],
            "upload_response": {
                "patient_orthanc_id": upload_response["ParentPatient"],
                "study_orthanc_id": upload_response["ParentStudy"],
                "series_orthanc_id": upload_response["ParentSeries"],
                "instance_orthanc_id": instance_orthanc_id
            }
        }
    
    except HTTPException:
        raise
    except Exception as err:
        db.rollback()
        if file_location and os.path.exists(file_location):
            os.remove(file_location)
            logger.info(f"Deleted local file due to error ar {file_location}")
        logger.error(f"Upload failed: {str(err)}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(err)}")