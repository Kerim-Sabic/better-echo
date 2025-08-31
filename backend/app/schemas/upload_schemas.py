from typing import Optional, Dict
from pydantic import BaseModel

class UploadDicomResponse(BaseModel):
    message: str
    filename: Optional[str] = None # None when file already exists in the db
    instance_id: str
    series_id: Optional[str] = None # None when file already exists in the db
    study_uid: str
    patient_id: Optional[str] = None # echo patient_id for UI
    tags: Optional[Dict[str,str]] = None # cleaned DICOM tags
    study_date: Optional[str] = None