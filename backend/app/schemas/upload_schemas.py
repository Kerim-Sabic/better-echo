from typing import Dict
from pydantic import BaseModel

from pydantic import BaseModel
from typing import Dict


class UploadDicomResponseSchema(BaseModel):
    message: str
    filename: str
    patient_id: str
    study_uid: str
    series_uid: str
    sop_instance_uid: str
    study_date: str | None
    tags: Dict[str, str]

    upload_response: Dict[str, str]  # contains orthanc ids

    class Config:
        from_attributes = True 
