from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class OverlayMetadata(BaseModel):
    sop_instance_uid: str
    instance_id: Optional[int] = None
    overlay_type: str
    overlay_key: Optional[str] = None
    kind: Optional[str] = None
    structured: bool = False
    status: str
    available: bool = False
    model_name: Optional[str] = None
    model_version: Optional[str] = None
    frame_count: Optional[int] = None
    frame_width: Optional[int] = None
    frame_height: Optional[int] = None
    fps: Optional[float] = None
    geometry_type: Optional[str] = None
    mask_format: Optional[str] = None
    mean_confidence: Optional[float] = None
    frames_with_mask: Optional[int] = None
    measurement_name: Optional[str] = None
    measurement_value: Optional[float] = None
    measurement_units: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    generated_at: Optional[str] = None
    payload_url: str


class InstanceOverlaysResponse(BaseModel):
    sop_instance_uid: str
    overlays: List[OverlayMetadata]


class StudyOverlaysResponse(BaseModel):
    study_uid: str
    overlays: List[OverlayMetadata]
