from typing import Optional
from pydantic import BaseModel

class UploadDicomResponse(BaseModel):
    message: str
    filename: Optional[str] = None # None when file already exists in the db
    instance_id: str
    study_uid: str
    series_id: Optional[str] = None # None when file already exists in the db