from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.inference.infer_linear_measurements_schemas import (
    LinearMeasurementsResponse,
)
from app.services.inference.linear_measurements import (
    run_linear_measurements,
)


router = APIRouter()


@router.post("/infer/measurements/2d", response_model=LinearMeasurementsResponse)
def infer_linear_measurements(
    sop_instance_uid: str = Query(
        ...,
        description="DICOM SOPInstanceUID to run 2D measurement annotation on",
    ),
    model_weights: str = Query(..., description="Linear measurement model weights"),
    force: bool = Query(False, description="Force re-run even if a cached result exists"),
    artifact_set_id: Optional[int] = Query(default=None, include_in_schema=False),
    skip_orthanc_check: bool = Query(default=False, include_in_schema=False),
    defer_model_unload: bool = Query(default=False, include_in_schema=False),
    db: Session = Depends(get_db),
):
    return run_linear_measurements(
        sop_instance_uid=sop_instance_uid,
        model_weights=model_weights,
        force=force,
        db=db,
        artifact_set_id=artifact_set_id,
        skip_orthanc_check=skip_orthanc_check,
        defer_model_unload=defer_model_unload,
    )
