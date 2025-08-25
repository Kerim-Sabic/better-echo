from typing import Dict, Any

from pydantic import BaseModel, Field

class EFPanEchoResponse(BaseModel):
    instance_id: str = Field(..., description="Orthanc instance ID used for inference")
    ef: float = Field(..., description="Predicted ejection fraction (percentage)")

class AllTasksPanEchoResponse(BaseModel):
    instance_id: str = Field(..., description="Orthanc instance ID used for inference")
    predictions: Dict[str, Any] = Field(
        ..., 
        description="Dictionary of PanEcho task predictions. Keys are task names, "
                    "values are floats, lists of floats, or raw values depending on the task"
    )