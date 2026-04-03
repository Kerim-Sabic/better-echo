from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class SpectralTagCheckResponse(BaseModel):
    success: bool
    sop_instance_uid: str
    is_doppler_candidate: bool
    reason_code: str
    details: Dict[str, Any]


class SpectralTagAuditItem(BaseModel):
    sop_instance_uid: str
    instance_number: Optional[str] = None
    is_doppler_candidate: bool
    reason_code: str
    details: Dict[str, Any]


class SpectralTagAuditResponse(BaseModel):
    success: bool
    study_uid: str
    total_instances: int
    doppler_candidates: int
    items: List[SpectralTagAuditItem]


class SpectralMeasurementsResponse(BaseModel):
    success: bool
    message: str
    sop_instance_uid: str
    model_weights: str
    metric_name: Optional[str] = None
    metric_value: Optional[float] = None
    units: Optional[str] = None
    output_file_image: Optional[str] = None
    in_progress: bool = False
    low_confidence: bool = False
    metadata: Optional[Dict[str, Any]] = None
