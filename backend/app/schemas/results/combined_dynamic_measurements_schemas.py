from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, Field


class DerivedDicomRef(BaseModel):
    relative_dicom_path: Optional[str] = None
    sop_instance_uid: Optional[str] = None
    series_instance_uid: Optional[str] = None
    series_description: Optional[str] = None
    orthanc_instance_id: Optional[str] = None
    orthanc_series_id: Optional[str] = None
    orthanc_study_id: Optional[str] = None
    orthanc_status: Optional[str] = None


class DynamicMeasurementResultItem(BaseModel):
    task: Optional[str] = None
    ui_label: Optional[str] = None
    status: Optional[str] = None
    output_path: Optional[str] = None
    output_kind: Optional[str] = None
    message: Optional[str] = None
    derived_dicom: Optional[DerivedDicomRef] = None


class DynamicMeasurementInstance(BaseModel):
    sop_instance_uid: Optional[str] = None
    instance_number: Optional[str] = None
    predicted_view: Optional[str] = None
    predicted_view_confidence: Optional[float] = None
    results: list[DynamicMeasurementResultItem] = Field(default_factory=list)


class DynamicMeasurementsMeta(BaseModel):
    motion_runs: Optional[int] = None
    linear_runs: Optional[int] = None
    spectral_runs: Optional[int] = None
    skipped_instances: Optional[int] = None
    error_count: Optional[int] = None


class DynamicMeasurementsPayload(BaseModel):
    instances: list[DynamicMeasurementInstance] = Field(default_factory=list)
    meta: Optional[DynamicMeasurementsMeta] = None


class CompleteResponse(BaseModel):
    status: Literal["complete"]
    measurement_results: DynamicMeasurementsPayload = Field(default_factory=DynamicMeasurementsPayload)


class PendingResponse(BaseModel):
    status: Literal["pending"]
    retry_after: int = Field(..., ge=1)
    measurement_results: DynamicMeasurementsPayload | None = None


class FailedResponse(BaseModel):
    status: Literal["failed"]
    detail: str | None = None


CombinedResultsResponse = Annotated[
    Union[CompleteResponse, PendingResponse, FailedResponse],
    Field(discriminator="status"),
]
