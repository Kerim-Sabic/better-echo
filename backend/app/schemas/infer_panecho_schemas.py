from typing import Dict, Any

from pydantic import BaseModel, Field

class AllTasksPanEchoResponse(BaseModel):
    study_uid: str = Field(..., description="Orthanc instance ID used for inference")
    num_instances: int
    predictions: Dict[str, Any] = Field(
        ..., 
        description="Dictionary of PanEcho task predictions. Keys are task names, "
                    "values are floats, lists of floats, or raw values depending on the task"
    )