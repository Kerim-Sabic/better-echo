import os
import aiofiles
import logging
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException


from services.orthanc_client import send_dicom_to_orthanc, get_instance_tags
from db import SessionLocal
from models.study import Study

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = "uploads"

@router.post("/upload-dicom")
async def upload_dicom(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    file_location = os.path.join(UPLOAD_DIR, f"{timestamp}_{file.filename}")

    try:
        # Save the uploaded file
        async with aiofiles.open(file_location, "wb") as out_file:
            content = await file.read()
            await out_file.write(content)
        logger.info(f"File saved locally at {file_location}")

        # Send the file to Orthanc
        instance_id = send_dicom_to_orthanc(file_location)
        logger.info(f"File uploaded to Orthanc. Instance ID: {instance_id}")

        # Fetch DICOM metadata from Orthanc
        tags = get_instance_tags(instance_id)
        logger.info(f"Retrieved tags from Orthanc for instance {instance_id}")

        # Extract relevant fields
        patient_id = tags.get("0010,0020", {}).get("Value", ["Unknown"])[0]
        study_date = tags.get("0008,0020", {}).get("Value", ["Unknown"])[0]
        logger.info(f"Extracted Patient ID: {patient_id}, Study Date: {study_date}")

        # Save to DB
        db = SessionLocal()
        study = Study(
            instance_id=instance_id,
            patient_id=patient_id,
            study_date=study_date,
            file_path=file_location
        )
        db.add(study)
        db.commit()
        db.refresh(study)
        db.close()
        logger.info(f"Study saved to database. Instance ID: {instance_id}")

        # Clean up the temporary file
        # try:
        #     os.remove(file_location)
        #     logger.info(f"Temporary file {file_location} deleted")
        # except Exception as e:
        #     logger.warning(f"Failed to delete temporary file {file_location}: {str(e)}")

        # Return success response
        return {
            "message": "Upload successful",
            "filename": file.filename,
            "instance_id": instance_id,
        }
    
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    
