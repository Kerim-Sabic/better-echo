from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.doppler.doppler_tags import inspect_doppler_tags
from app.schemas.inference.infer_spectral_measurements_schemas import (
    SpectralMeasurementsResponse,
    SpectralTagAuditItem,
    SpectralTagAuditResponse,
    SpectralTagCheckResponse,
)
from app.services.inference.spectral_measurements import (
    audit_spectral_tags_for_study,
    resolve_spectral_instance_or_400,
    run_spectral_measurements,
)


router = APIRouter()


@router.get("/infer/measurements/doppler/tag-check", response_model=SpectralTagCheckResponse)
def check_doppler_tags(
    sop_instance_uid: str = Query(
        ...,
        description="DICOM SOPInstanceUID to inspect Doppler tags for",
    ),
    db: Session = Depends(get_db),
):
    instance = resolve_spectral_instance_or_400(db, sop_instance_uid)
    report = inspect_doppler_tags(instance.file_path)
    return SpectralTagCheckResponse(
        success=bool(report.get("ok")),
        sop_instance_uid=sop_instance_uid,
        is_doppler_candidate=bool(report.get("is_doppler_candidate")),
        reason_code=str(report.get("reason_code")),
        details=report.get("details") or {},
    )


@router.get("/infer/measurements/doppler/tag-audit/{study_uid}", response_model=SpectralTagAuditResponse)
def audit_doppler_tags_for_study(
    study_uid: str,
    db: Session = Depends(get_db),
):
    payload = audit_spectral_tags_for_study(db, study_uid)
    items = [SpectralTagAuditItem(**item) for item in payload["items"]]
    return SpectralTagAuditResponse(**{**payload, "items": items})


@router.post("/infer/measurements/doppler", response_model=SpectralMeasurementsResponse)
def infer_spectral_measurements(
    sop_instance_uid: str = Query(
        ...,
        description="DICOM SOPInstanceUID to run Doppler inference on",
    ),
    model_weights: str = Query(..., description="Spectral measurement model weights"),
    force: bool = Query(False, description="Force re-run even if a cached result exists"),
    artifact_set_id: Optional[int] = Query(default=None, include_in_schema=False),
    defer_model_unload: bool = Query(default=False, include_in_schema=False),
    db: Session = Depends(get_db),
):
    return run_spectral_measurements(
        sop_instance_uid=sop_instance_uid,
        model_weights=model_weights,
        force=force,
        db=db,
        artifact_set_id=artifact_set_id,
        defer_model_unload=defer_model_unload,
    )
