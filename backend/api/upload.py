from fastapi import APIRouter, UploadFile, File, HTTPException
import aiofiles
import os
from datetime import datetime
from services.orthanc_client import send_dicom_to_orthanc

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

        # Send the file to Orthanc
        instance_id = send_dicom_to_orthanc(file_location)

        return {
            "message": "Upload successful",
            "filename": file.filename,
            "instance_id": instance_id,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
