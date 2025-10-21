from pydantic import BaseModel


class Measurements2DResponse(BaseModel):
    success: bool
    message: str
    sop_instance_uid: str
    model_weights: str
    output_file_mp4: str | None = None
    min_length_cm: float | None = None
    max_length_cm: float | None = None
    in_progress: bool | None = False
