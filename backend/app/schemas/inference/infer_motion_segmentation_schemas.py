from pydantic import BaseModel


class MotionSegmentationResponse(BaseModel):
    success: bool
    message: str
    output_file: str
