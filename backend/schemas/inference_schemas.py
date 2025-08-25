from pydantic import BaseModel, Field

class EFResponse(BaseModel):
    instance_id: str = Field(..., description="Orthanc instance ID used for inference")
    ef: float = Field(..., description="Predicted ejection fraction (percentage)")