import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import logging

from app.AI_models.measurements.runner_doppler import (
    VALID_DOPPLER_WEIGHTS,
    run_doppler_inference,
)
from app.core.artifacts import BASE_DIR
from app.database.db import get_db
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.helpers.doppler.doppler_tags import inspect_doppler_tags
from app.schemas.inference.infer_doppler_schemas import (
    DopplerInferenceResponse,
    DopplerTagAuditItem,
    DopplerTagAuditResponse,
    DopplerTagCheckResponse,
)


logger = logging.getLogger(__name__)
router = APIRouter()

UPLOADS_ROOT = os.path.normpath(os.path.join(BASE_DIR, "..", "uploads"))
DOPPLER_UPLOAD_ROOT = os.path.join(UPLOADS_ROOT, "measurements_doppler")
os.makedirs(DOPPLER_UPLOAD_ROOT, exist_ok=True)

PW_COMPATIBLE_WEIGHTS = {"lvotvmax", "latevel", "medevel", "mvpeak_2c", "tapse_2c"}
CW_COMPATIBLE_WEIGHTS = {"avvmax", "trvmax", "mrvmax"}


def _rel_uploads(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    try:
        rel_path = os.path.relpath(path, UPLOADS_ROOT)
        return rel_path.replace("\\", "/")
    except Exception:
        return path


def _resolve_instance(db: Session, sop_instance_uid: str) -> Instance:
    instance = db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    if not instance:
        raise HTTPException(status_code=400, detail=f"No instance found with sop_instance_uid={sop_instance_uid}")
    if not instance.file_path or not os.path.exists(instance.file_path):
        raise HTTPException(status_code=400, detail=f"Local DICOM file not found for sop_instance_uid={sop_instance_uid}")
    return instance


def _validate_weight_subtype_compatibility(model_weights: str, spectral_subtype: Optional[str]) -> None:
    """
    Validate Doppler weight selection against detected spectral subtype when available.
    """
    # --- Part 1: Skip strict compatibility if subtype is missing ---
    subtype = (spectral_subtype or "").strip().lower()
    if not subtype:
        return

    # --- Part 2: Enforce subtype-compatible weight groups ---
    if subtype == "pw" and model_weights not in PW_COMPATIBLE_WEIGHTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Weight '{model_weights}' is not compatible with spectral subtype 'pw'. "
                f"Allowed weights: {', '.join(sorted(PW_COMPATIBLE_WEIGHTS))}"
            ),
        )

    if subtype == "cw" and model_weights not in CW_COMPATIBLE_WEIGHTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Weight '{model_weights}' is not compatible with spectral subtype 'cw'. "
                f"Allowed weights: {', '.join(sorted(CW_COMPATIBLE_WEIGHTS))}"
            ),
        )


@router.get("/infer/measurements/doppler/tag-check", response_model=DopplerTagCheckResponse)
def check_doppler_tags(
    sop_instance_uid: str = Query(..., description="DICOM SOPInstanceUID to inspect Doppler tags for"),
    db: Session = Depends(get_db),
):
    """
    Inspect Doppler-related DICOM tags for one instance.

    Steps:
    1. Resolve local instance by SOPInstanceUID.
    2. Parse Doppler tags and region metadata.
    3. Return candidate decision with reason code and details.
    """
    instance = _resolve_instance(db, sop_instance_uid)
    report = inspect_doppler_tags(instance.file_path)
    return DopplerTagCheckResponse(
        success=bool(report.get("ok")),
        sop_instance_uid=sop_instance_uid,
        is_doppler_candidate=bool(report.get("is_doppler_candidate")),
        reason_code=str(report.get("reason_code")),
        details=report.get("details") or {},
    )


@router.get("/infer/measurements/doppler/tag-audit/{study_uid}", response_model=DopplerTagAuditResponse)
def audit_doppler_tags_for_study(
    study_uid: str,
    db: Session = Depends(get_db),
):
    """
    Audit Doppler tags for every instance in a study.

    Steps:
    1. Resolve study by study UID.
    2. Enumerate all instances in the study.
    3. Inspect Doppler tags per instance and return summarized decisions.
    """
    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    instances: List[Instance] = (
        db.query(Instance)
        .join(Instance.series)
        .join(Series.study)
        .filter(Study.id == study.id)
        .all()
    )

    items: List[DopplerTagAuditItem] = []
    candidate_count = 0
    for instance in instances:
        if not instance.file_path or not os.path.exists(instance.file_path):
            report = {
                "ok": False,
                "is_doppler_candidate": False,
                "reason_code": "FILE_NOT_FOUND",
                "details": {"file_path": instance.file_path},
            }
        else:
            report = inspect_doppler_tags(instance.file_path)

        is_candidate = bool(report.get("is_doppler_candidate"))
        candidate_count += int(is_candidate)
        items.append(
            DopplerTagAuditItem(
                sop_instance_uid=instance.sop_instance_uid,
                instance_number=instance.instance_number,
                is_doppler_candidate=is_candidate,
                reason_code=str(report.get("reason_code")),
                details=report.get("details") or {},
            )
        )

    return DopplerTagAuditResponse(
        success=True,
        study_uid=study_uid,
        total_instances=len(items),
        doppler_candidates=candidate_count,
        items=items,
    )


@router.post("/infer/measurements/doppler", response_model=DopplerInferenceResponse)
def infer_measurements_doppler(
    sop_instance_uid: str = Query(..., description="DICOM SOPInstanceUID to run Doppler inference on"),
    model_weights: str = Query(..., description=f"One of: {', '.join(sorted(list(VALID_DOPPLER_WEIGHTS)))}"),
    force: bool = Query(False, description="Force re-run even if a cached result exists"),
    artifact_set_id: Optional[int] = Query(default=None, include_in_schema=False),
    db: Session = Depends(get_db),
):
    """
    Run Doppler measurement inference on a single DICOM instance.

    Steps:
    1. Resolve local instance and validate Doppler tags.
    2. Return cached DerivedResult when available unless forced.
    3. Acquire lock to prevent duplicate concurrent runs.
    4. Run Doppler model inference and persist result payload.
    5. Release lock and return response.
    """
    model_weights = model_weights.strip().lower()
    if model_weights not in VALID_DOPPLER_WEIGHTS:
        raise HTTPException(status_code=400, detail=f"Invalid model_weights '{model_weights}'")

    instance = _resolve_instance(db, sop_instance_uid)
    tag_report = inspect_doppler_tags(instance.file_path)
    if not tag_report.get("is_doppler_candidate"):
        raise HTTPException(
            status_code=400,
            detail=f"DICOM is not Doppler-compatible: {tag_report.get('reason_code')}",
        )
    selected_region = tag_report.get("details", {}).get("doppler_region") or {}
    spectral_subtype = tag_report.get("details", {}).get("spectral_subtype")
    _validate_weight_subtype_compatibility(model_weights, spectral_subtype)
    if selected_region.get("reference_line") is None:
        raise HTTPException(status_code=400, detail="DICOM is missing reference line tag for Doppler computation")
    if selected_region.get("physical_delta_y") is None:
        raise HTTPException(status_code=400, detail="DICOM is missing physical delta y tag for Doppler computation")
    if model_weights in {"mvpeak_2c", "tapse_2c"} and selected_region.get("physical_delta_x") is None:
        raise HTTPException(status_code=400, detail="DICOM is missing physical delta x tag for 2-point Doppler computation")

    study_uid = instance.series.study.study_uid
    out_dir = os.path.join(DOPPLER_UPLOAD_ROOT, study_uid, sop_instance_uid)
    os.makedirs(out_dir, exist_ok=True)

    dr_type = f"EchoNetMeasurementsDoppler_{model_weights}"
    existing = (
        db.query(DerivedResult)
        .filter(DerivedResult.instance_id == instance.id, DerivedResult.type == dr_type)
        .order_by(DerivedResult.id.desc())
        .first()
    )

    if (not force) and existing and isinstance(existing.value_json, dict):
        payload = existing.value_json
        out_image_rel = payload.get("outputfile")
        abs_image = os.path.join(UPLOADS_ROOT, out_image_rel) if out_image_rel else None
        if abs_image and os.path.exists(abs_image):
            return DopplerInferenceResponse(
                success=True,
                message="Cached result returned",
                sop_instance_uid=sop_instance_uid,
                model_weights=model_weights,
                metric_name=payload.get("metric_name"),
                metric_value=payload.get("metric_value"),
                units=payload.get("units"),
                output_file_image=out_image_rel,
                in_progress=False,
                low_confidence=bool(payload.get("metadata", {}).get("low_confidence")),
                metadata=payload.get("metadata"),
            )

    lock_path = os.path.join(out_dir, f"{model_weights}.lock")
    try:
        if os.path.exists(lock_path):
            return DopplerInferenceResponse(
                success=True,
                message="Inference in progress",
                sop_instance_uid=sop_instance_uid,
                model_weights=model_weights,
                in_progress=True,
            )
        with open(lock_path, "w", encoding="utf-8") as lock_file:
            lock_file.write("running")
    except Exception:
        pass

    try:
        result = run_doppler_inference(
            model_weights=model_weights,
            input_path=instance.file_path,
            output_dir=out_dir,
            region_override=selected_region,
        )
    except Exception as err:
        logger.exception("[Doppler] Inference failed")
        try:
            if os.path.exists(lock_path):
                os.remove(lock_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Doppler inference failed: {err}")

    payload: Dict[str, Any] = {
        "outputfile": _rel_uploads(result.get("output_file_image")),
        "model_weights": model_weights,
        "metric_name": result.get("metric_name"),
        "metric_value": result.get("metric_value"),
        "units": result.get("units"),
        "metadata": result.get("metadata"),
    }

    try:
        if artifact_set_id is not None:
            dr = (
                db.query(DerivedResult)
                .filter(
                    DerivedResult.instance_id == instance.id,
                    DerivedResult.type == dr_type,
                    DerivedResult.artifact_set_id == artifact_set_id,
                )
                .order_by(DerivedResult.id.desc())
                .first()
            )
            if not dr:
                dr = DerivedResult(
                    study_id=instance.series.study.id,
                    instance_id=instance.id,
                    type=dr_type,
                    model_name="EchoNetMeasurementsDoppler",
                    model_version="v1",
                    artifact_set_id=artifact_set_id,
                )
                db.add(dr)
            dr.value_json = payload
        else:
            dr = DerivedResult(
                study_id=instance.series.study.id,
                instance_id=instance.id,
                type=dr_type,
                value_json=payload,
                model_name="EchoNetMeasurementsDoppler",
                model_version="v1",
            )
            db.add(dr)
        db.commit()
    except Exception as err:
        logger.warning("[Doppler] Failed to persist DerivedResult: %s", err)

    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except Exception:
        pass

    return DopplerInferenceResponse(
        success=True,
        message=(
            "Inference completed with low confidence"
            if bool(payload.get("metadata", {}).get("low_confidence"))
            else "Inference completed"
        ),
        sop_instance_uid=sop_instance_uid,
        model_weights=model_weights,
        metric_name=payload.get("metric_name"),
        metric_value=payload.get("metric_value"),
        units=payload.get("units"),
        output_file_image=payload.get("outputfile"),
        in_progress=False,
        low_confidence=bool(payload.get("metadata", {}).get("low_confidence")),
        metadata=payload.get("metadata"),
    )

