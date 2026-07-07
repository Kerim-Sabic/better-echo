from typing import Any, Dict, List, Optional, Union, Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field


class GlsBullseyeSegment(BaseModel):
    # extra="allow" carries any future per-segment fields without a schema bump.
    model_config = ConfigDict(extra="allow")

    id: int
    code: str
    name: str
    ring: int
    ring_name: str
    wedge_index: int
    wedge_count: int
    territory: str
    measured: bool = False
    value: Optional[float] = None
    status: Optional[str] = None
    color: Optional[str] = None


class GlsTrendPoint(BaseModel):
    model_config = ConfigDict(extra="allow")

    study_uid: Optional[str] = None
    study_date: Optional[str] = None
    label: Optional[str] = None
    value: Optional[float] = None
    status: Optional[str] = None


class GlsBullseyePayload(BaseModel):
    # The "global" block, reference_bands, segment_model and notes ride through
    # as permitted extras (avoids a reserved-word field alias).
    model_config = ConfigDict(extra="allow")

    schema_version: int = 1
    presentation: Optional[str] = None
    data_completeness: Optional[str] = None
    segments: List[GlsBullseyeSegment] = Field(default_factory=list)
    measured_segment_count: int = 0
    trend: List[GlsTrendPoint] = Field(default_factory=list)


class DisplayMeasurementItem(BaseModel):
    key: str
    label: str
    kind: Literal["numeric", "categorical"]
    displayValue: Optional[str] = None
    rawValue: Optional[float] = None
    units: Optional[str] = None
    probabilities: Optional[Dict[str, float]] = None
    color: Optional[str] = None
    discrepancy: Optional[bool] = None
    isOverridden: bool = False
    editable: bool = True
    editType: Literal["label", "value"]
    editOptions: Optional[List[str]] = None


class DisplayMeasurementSection(BaseModel):
    section: str
    items: List[DisplayMeasurementItem] = Field(default_factory=list)


class CombinedDisplayPayload(BaseModel):
    mainMeasurements: List[DisplayMeasurementItem] = Field(default_factory=list)
    Measurements: List[DisplayMeasurementSection] = Field(default_factory=list)
    hasMainMeasurements: bool = False
    hasMeasurements: bool = False
    totalMeasurements: int = 0
    glsBullseye: Optional[GlsBullseyePayload] = None


class CombinedSections(BaseModel):
    """Structured payload built by build_combined_sections_from_row()"""
    edit_baselines: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    overrides: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    overrides_updated_at: Optional[str] = None
    display: Optional[CombinedDisplayPayload] = None

class CompleteResponse(BaseModel):
    status: Literal["complete"]
    analysis_results: CombinedSections

class PendingResponse(BaseModel):
    status: Literal["pending"]
    retry_after: int = Field(..., ge=1)

class FailedResponse(BaseModel):
    status: Literal["failed"]
    detail: Optional[str] = None

CombinedResultsResponse = Annotated[
    Union[CompleteResponse, PendingResponse, FailedResponse],
    Field(discriminator="status"),
]
