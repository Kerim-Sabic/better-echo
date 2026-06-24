from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.inference.infer_motion_segmentation_schemas import (
    MotionSegmentationResponse,
)
from app.services.inference.motion_segmentation import (
    load_motion_segmentation_model,
    run_motion_segmentation,
    unload_motion_segmentation_model,
)


router = APIRouter()


@router.post("/infer/motion-segmentation/lv", response_model=MotionSegmentationResponse)
def infer_motion_segmentation(
    sop_instance_uid: str = Query(
        ...,
        description="The DICOM SOPInstanceUID to run segmentation on",
    ),
    artifact_set_id: int | None = Query(default=None, include_in_schema=False),
    skip_orthanc_check: bool = Query(default=False, include_in_schema=False),
    defer_model_unload: bool = Query(default=False, include_in_schema=False),
    db: Session = Depends(get_db),
):
    return run_motion_segmentation(
        sop_instance_uid=sop_instance_uid,
        db=db,
        artifact_set_id=artifact_set_id,
        skip_orthanc_check=skip_orthanc_check,
        defer_model_unload=defer_model_unload,
    )
