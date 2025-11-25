from pydantic import BaseModel

class LVSegmentationResponse(BaseModel):
    success: bool
    message: str
    output_file: str #path to saved avi file