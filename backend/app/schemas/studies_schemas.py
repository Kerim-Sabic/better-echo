from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, RootModel


class PatientSchema(BaseModel):
    id: int
    patient_id: str
    patient_name: Optional[str] = None
    patient_sex: Optional[str] = None
    patient_birth_date: Optional[str] = None

    class Config:
        from_attributes = True

class StudySchema(BaseModel):
    id: int
    study_uid: str
    study_date: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    uploaded_at: datetime
    patient: PatientSchema

    class Config:
        from_attributes = True

class StudyListResponse(RootModel[List[StudySchema]]):
    pass


class StudyDeleteResponse(BaseModel):
    ok: bool
    message: str


class DerivedResultResponse(BaseModel):
    id: int
    type: str
    value_numeric: Optional[float] = None
    value_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
