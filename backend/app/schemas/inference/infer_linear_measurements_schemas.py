from pydantic import BaseModel


class LinearMeasurementsResponse(BaseModel):
    success: bool
    message: str
    sop_instance_uid: str
    model_weights: str
    overlay_type: str | None = None
    overlay_key: str | None = None
    kind: str | None = None
    has_overlay: bool | None = None
    metric_name: str | None = None
    metric_value: float | None = None
    units: str | None = None
    output_file_mp4: str | None = None
    min_length_cm: float | None = None
    max_length_cm: float | None = None
    in_progress: bool | None = False
