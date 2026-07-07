from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.AI_models.measurements.constants import VALID_DOPPLER_WEIGHTS
from app.core.artifacts import (
    DOPPLER_MEASUREMENT_OVERLAY_KIND,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE,
    SPECTRAL_MEASUREMENTS_UPLOAD_DIRNAME,
    UPLOAD_DIR,
    spectral_measurements_result_type,
)
from app.core.config import settings
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.helpers.doppler.doppler_tags import inspect_doppler_tags
from app.helpers.media.frame_cache import get_study_frame_cache
from app.services.inference.spectral_measurements.inference import (
    run_doppler_inference,
    unload_doppler_models,
)
from app.services.inference.spectral_measurements.overlay_document import (
    build_overlay_document,
    is_structured_overlay,
    persist_overlay_result,
)

logger = logging.getLogger(__name__)

UPLOADS_ROOT = UPLOAD_DIR
DOPPLER_UPLOAD_ROOT = os.path.join(UPLOADS_ROOT, SPECTRAL_MEASUREMENTS_UPLOAD_DIRNAME)
os.makedirs(DOPPLER_UPLOAD_ROOT, exist_ok=True)

PW_COMPATIBLE_WEIGHTS = {"lvotvmax", "latevel", "medevel", "mvpeak_2c", "tapse_2c"}
CW_COMPATIBLE_WEIGHTS = {"avvmax", "trvmax", "mrvmax"}


def resolve_spectral_instance_or_400(db: Session, sop_instance_uid: str) -> Instance:
    instance = (
        db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    )
    if not instance:
        raise HTTPException(
            status_code=400,
            detail=f"No instance found with sop_instance_uid={sop_instance_uid}",
        )
    if not instance.file_path or not os.path.exists(instance.file_path):
        raise HTTPException(
            status_code=400,
            detail=f"Local DICOM file not found for sop_instance_uid={sop_instance_uid}",
        )
    return instance


def validate_weight_subtype_compatibility(
    model_weights: str,
    spectral_subtype: Optional[str],
) -> None:
    subtype = (spectral_subtype or "").strip().lower()
    if not subtype:
        return

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


def audit_spectral_tags_for_study(db: Session, study_uid: str) -> Dict[str, Any]:
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

    items: List[Dict[str, Any]] = []
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
            {
                "sop_instance_uid": instance.sop_instance_uid,
                "instance_number": instance.instance_number,
                "is_doppler_candidate": is_candidate,
                "reason_code": str(report.get("reason_code")),
                "details": report.get("details") or {},
            }
        )

    return {
        "success": True,
        "study_uid": study_uid,
        "total_instances": len(items),
        "doppler_candidates": candidate_count,
        "items": items,
    }


def _validate_doppler_request(instance: Instance, model_weights: str) -> dict[str, Any]:
    tag_report = inspect_doppler_tags(instance.file_path)
    if not tag_report.get("is_doppler_candidate"):
        raise HTTPException(
            status_code=400,
            detail=f"DICOM is not Doppler-compatible: {tag_report.get('reason_code')}",
        )

    details = tag_report.get("details") or {}
    selected_region = details.get("doppler_region") or {}
    spectral_subtype = details.get("spectral_subtype")
    validate_weight_subtype_compatibility(model_weights, spectral_subtype)
    if selected_region.get("reference_line") is None:
        raise HTTPException(
            status_code=400,
            detail="DICOM is missing reference line tag for Doppler computation",
        )
    if selected_region.get("physical_delta_y") is None:
        raise HTTPException(
            status_code=400,
            detail="DICOM is missing physical delta y tag for Doppler computation",
        )
    if model_weights in {"mvpeak_2c", "tapse_2c"} and selected_region.get(
        "physical_delta_x"
    ) is None:
        raise HTTPException(
            status_code=400,
            detail="DICOM is missing physical delta x tag for 2-point Doppler computation",
        )
    return selected_region


def _response_from_document(
    *,
    document: dict[str, Any],
    sop_instance_uid: str,
    model_weights: str,
    message: str,
) -> dict:
    measurement = document.get("measurement") or {}
    quality = document.get("quality") or {}
    low_confidence = bool(quality.get("low_confidence"))
    return {
        "success": True,
        "message": message,
        "sop_instance_uid": sop_instance_uid,
        "model_weights": model_weights,
        "overlay_type": DOPPLER_MEASUREMENT_OVERLAY_TYPE,
        "overlay_key": model_weights,
        "kind": DOPPLER_MEASUREMENT_OVERLAY_KIND,
        "has_overlay": bool(document.get("points")),
        "metric_name": measurement.get("name"),
        "metric_value": measurement.get("value"),
        "units": measurement.get("units"),
        "output_file_image": None,
        "in_progress": False,
        "low_confidence": low_confidence,
        "metadata": document.get("metadata"),
    }


def _existing_result(
    *,
    db: Session,
    instance: Instance,
    model_weights: str,
    artifact_set_id: int | None,
) -> DerivedResult | None:
    query = db.query(DerivedResult).filter(
        DerivedResult.instance_id == instance.id,
        DerivedResult.type == spectral_measurements_result_type(model_weights),
    )
    if artifact_set_id is None:
        query = query.filter(DerivedResult.artifact_set_id.is_(None))
    else:
        query = query.filter(DerivedResult.artifact_set_id == artifact_set_id)
    return query.order_by(DerivedResult.id.desc()).first()


# Part 1. Public service entrypoint used by API and pipeline callers.
def run_spectral_measurements(
    *,
    sop_instance_uid: str,
    model_weights: str,
    force: bool,
    db: Session,
    artifact_set_id: Optional[int] = None,
    defer_model_unload: bool = False,
):
    model_weights = model_weights.strip().lower()
    if model_weights not in VALID_DOPPLER_WEIGHTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model_weights '{model_weights}'",
        )

    unload_after_request = (
        str(settings.PIPELINE_UNLOAD_POLICY).strip().lower() == "stage"
        or str(settings.INFERENCE_PROFILE).strip().lower() == "low_vram"
    )
    instance = resolve_spectral_instance_or_400(db, sop_instance_uid)
    selected_region = _validate_doppler_request(instance, model_weights)

    existing = _existing_result(
        db=db,
        instance=instance,
        model_weights=model_weights,
        artifact_set_id=artifact_set_id,
    )
    if (
        (not force)
        and existing
        and isinstance(existing.value_json, dict)
        and is_structured_overlay(existing.value_json)
    ):
        return _response_from_document(
            document=existing.value_json,
            sop_instance_uid=sop_instance_uid,
            model_weights=model_weights,
            message="Cached result returned",
        )

    lock_dir = os.path.join(
        DOPPLER_UPLOAD_ROOT,
        instance.series.study.study_uid,
        sop_instance_uid,
    )
    os.makedirs(lock_dir, exist_ok=True)
    lock_path = os.path.join(lock_dir, f"{model_weights}.lock")
    try:
        if os.path.exists(lock_path):
            return {
                "success": True,
                "message": "Inference in progress",
                "sop_instance_uid": sop_instance_uid,
                "model_weights": model_weights,
                "overlay_type": DOPPLER_MEASUREMENT_OVERLAY_TYPE,
                "overlay_key": model_weights,
                "kind": DOPPLER_MEASUREMENT_OVERLAY_KIND,
                "has_overlay": False,
                "output_file_image": None,
                "in_progress": True,
            }
        with open(lock_path, "w", encoding="utf-8") as lock_file:
            lock_file.write("running")
    except Exception:
        pass

    try:
        start = time.time()
        try:
            prediction = run_doppler_inference(
                model_weights=model_weights,
                input_path=instance.file_path,
                region_override=selected_region,
                cache=get_study_frame_cache(
                    instance.series.study.study_uid
                    if instance.series and instance.series.study
                    else None
                ),
            )
        except Exception as err:
            logger.exception("[Doppler] Inference failed")
            raise HTTPException(
                status_code=500,
                detail=f"Doppler inference failed: {err}",
            ) from err
        finally:
            if unload_after_request and (not defer_model_unload):
                unload_doppler_models()

        document = build_overlay_document(
            instance=instance,
            model_weights=model_weights,
            prediction=prediction,
            duration_s=time.time() - start,
        )
        persist_overlay_result(
            db=db,
            instance=instance,
            model_weights=model_weights,
            artifact_set_id=artifact_set_id,
            document=document,
        )
        low_confidence = bool(document.get("quality", {}).get("low_confidence"))
        return _response_from_document(
            document=document,
            sop_instance_uid=sop_instance_uid,
            model_weights=model_weights,
            message=(
                "Doppler measurement completed with low confidence"
                if low_confidence
                else "Doppler measurement completed"
            ),
        )
    finally:
        try:
            if os.path.exists(lock_path):
                os.remove(lock_path)
        except Exception:
            pass


__all__ = [
    "audit_spectral_tags_for_study",
    "resolve_spectral_instance_or_400",
    "run_spectral_measurements",
    "unload_doppler_models",
    "validate_weight_subtype_compatibility",
]
