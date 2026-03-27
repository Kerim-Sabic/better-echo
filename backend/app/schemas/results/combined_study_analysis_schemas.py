from typing import Any, Dict, List, Optional, Union, Annotated, Literal
from pydantic import BaseModel, Field

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
