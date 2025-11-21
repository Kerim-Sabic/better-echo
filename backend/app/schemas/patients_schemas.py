from pydantic import BaseModel
from typing import Optional

class PatientBase(BaseModel):
    study_uid: str
    patient_id: str
    patient_name: Optional[str]
    patient_sex: Optional[str]
    patient_birth_date: Optional[str]

    class Config:
        from_attributes = True