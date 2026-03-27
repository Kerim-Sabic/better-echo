from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class InferPrimaryAnalysisRequest(BaseModel):
    study_uid: str
    include_instance_orthanc_ids: Optional[List[str]] = None
    artifact_set_id: Optional[int] = None


class PrimaryAnalysisResponse(BaseModel):
    study_uid: str = Field(..., description="Study instance UID used for inference")
    num_instances: int
    predictions: Dict[str, Any] = Field(
        ...,
        description=(
            "Dictionary of study-analysis task predictions. Keys are task names and "
            "values are floats, lists of floats, or raw values depending on the task."
        ),
    )
