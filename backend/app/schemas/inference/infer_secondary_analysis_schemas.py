from typing import Dict, List, Optional

from pydantic import BaseModel


class InferSecondaryAnalysisRequest(BaseModel):
    study_uid: str
    include_instance_orthanc_ids: Optional[List[str]] = None
    artifact_set_id: Optional[int] = None


class SecondaryAnalysisResponse(BaseModel):
    study_uid: str
    num_instances: int
    predictions: Dict[str, float]
