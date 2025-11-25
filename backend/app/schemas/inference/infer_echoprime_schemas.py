from typing import Dict

from pydantic import BaseModel

class InferEchoPrimeRequest(BaseModel):
    study_uid: str

class EchoPrimeResponse(BaseModel):
    study_uid: str
    num_instances: int
    predictions: Dict[str, float]
    report: str