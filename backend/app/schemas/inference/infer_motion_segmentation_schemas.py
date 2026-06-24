from typing import Optional

from pydantic import BaseModel


class MotionSegmentationResponse(BaseModel):
    success: bool
    message: str
    overlay_type: str = "lv_segmentation"
    kind: str = "lv_segmentation_overlay"
    has_overlay: bool = False
    frame_count: int = 0
    mean_confidence: Optional[float] = None
    output_file: Optional[str] = None
