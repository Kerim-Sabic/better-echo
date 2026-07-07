from __future__ import annotations

import logging
import os
import time

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.AI_models.measurements.constants import VALID_2D_WEIGHTS
from app.core.artifacts import (
    LINEAR_MEASUREMENT_OVERLAY_KIND,
    LINEAR_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENTS_UPLOAD_DIRNAME,
    UPLOAD_DIR,
    linear_measurements_result_type,
)
from app.core.config import settings
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.helpers.inference_runtime.inference_functions import check_instance_exists_in_orthanc
from app.helpers.media.frame_cache import get_study_frame_cache
from app.services.inference.linear_measurements.geometry import (
    build_frame_geometry,
    load_measurement_inputs,
)
from app.services.inference.linear_measurements.inference import (
    predict_linear_measurement_points,
    unload_2d_models,
)
from app.services.inference.linear_measurements.overlay_document import (
    build_overlay_document,
    is_structured_overlay,
    persist_overlay_result,
)

logger = logging.getLogger(__name__)

UPLOADS_ROOT = UPLOAD_DIR
LOCK_ROOT = os.path.join(UPLOADS_ROOT, LINEAR_MEASUREMENTS_UPLOAD_DIRNAME)
os.makedirs(LOCK_ROOT, exist_ok=True)


def _cached_response(
    *,
    payload: dict,
    sop_instance_uid: str,
    model_weights: str,
) -> dict:
    quality = payload.get("quality") if isinstance(payload.get("quality"), dict) else {}
    max_length_cm = quality.get("max_length_cm")
    return {
        "success": True,
        "message": "Cached result returned",
        "sop_instance_uid": sop_instance_uid,
        "model_weights": model_weights,
        "overlay_type": LINEAR_MEASUREMENT_OVERLAY_TYPE,
        "overlay_key": model_weights,
        "kind": LINEAR_MEASUREMENT_OVERLAY_KIND,
        "has_overlay": bool(payload.get("frames")),
        "metric_name": model_weights,
        "metric_value": max_length_cm,
        "units": "cm" if max_length_cm is not None else None,
        "output_file_mp4": None,
        "min_length_cm": quality.get("min_length_cm"),
        "max_length_cm": max_length_cm,
        "confidence_score": quality.get("confidence_score"),
        "low_confidence": quality.get("low_confidence"),
        "in_progress": False,
    }


# Part 1. Resolve the instance and current artifact-scoped cached result.
def _resolve_instance_and_existing(
    *,
    db: Session,
    sop_instance_uid: str,
    model_weights: str,
    artifact_set_id: int | None,
) -> tuple[Instance, DerivedResult | None]:
    instance = (
        db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    )
    if not instance or not instance.file_path or not os.path.exists(instance.file_path):
        raise HTTPException(
            status_code=400,
            detail="Local file path for the instance not found.",
        )

    query = db.query(DerivedResult).filter(
        DerivedResult.instance_id == instance.id,
        DerivedResult.type == linear_measurements_result_type(model_weights),
    )
    if artifact_set_id is None:
        query = query.filter(DerivedResult.artifact_set_id.is_(None))
    else:
        query = query.filter(DerivedResult.artifact_set_id == artifact_set_id)

    return instance, query.order_by(DerivedResult.id.desc()).first()


# Part 2. Run model inference and persist source-space point-line geometry.
def _run_structured(
    *,
    instance: Instance,
    model_weights: str,
    db: Session,
    artifact_set_id: int | None,
    defer_model_unload: bool,
) -> dict:
    start = time.time()
    frame_cache = get_study_frame_cache(
        instance.series.study.study_uid if instance.series and instance.series.study else None
    )
    inputs = load_measurement_inputs(instance.file_path, cache=frame_cache)
    try:
        prediction = predict_linear_measurement_points(
            model_weights=model_weights,
            model_frames_bgr=inputs.model_frames_bgr,
            model_input_tensor=inputs.model_input_tensor,
        )
    finally:
        unload_after_request = (
            str(settings.PIPELINE_UNLOAD_POLICY).strip().lower() == "stage"
            or str(settings.INFERENCE_PROFILE).strip().lower() == "low_vram"
        )
        if unload_after_request and (not defer_model_unload):
            unload_2d_models()

    if prediction.coordinates.shape[0] != len(inputs.source_frames_bgr):
        raise HTTPException(
            status_code=500,
            detail="2D measurement prediction count did not match source frame count.",
        )

    frame_geometry = build_frame_geometry(
        predictions=prediction.coordinates,
        point_confidences=prediction.point_confidences,
        frame_width=inputs.frame_width,
        frame_height=inputs.frame_height,
        dicom_scale=inputs.dicom_scale,
        measurement_name=model_weights,
    )
    document = build_overlay_document(
        instance=instance,
        model_weights=model_weights,
        frames=frame_geometry,
        frame_width=inputs.frame_width,
        frame_height=inputs.frame_height,
        fps=inputs.fps,
        duration_s=time.time() - start,
    )
    persist_overlay_result(
        db=db,
        instance=instance,
        model_weights=model_weights,
        artifact_set_id=artifact_set_id,
        document=document,
    )
    quality = document["quality"]
    max_length_cm = quality.get("max_length_cm")

    logger.info(
        "[LinearMeasurements] Saved structured overlay | study_uid=%s weight=%s frames=%d",
        instance.series.study.study_uid,
        model_weights,
        document["frame_count"],
    )
    return {
        "success": True,
        "message": "2D linear measurement completed",
        "sop_instance_uid": instance.sop_instance_uid,
        "model_weights": model_weights,
        "overlay_type": LINEAR_MEASUREMENT_OVERLAY_TYPE,
        "overlay_key": model_weights,
        "kind": LINEAR_MEASUREMENT_OVERLAY_KIND,
        "has_overlay": quality["frames_with_geometry"] > 0,
        "metric_name": model_weights,
        "metric_value": max_length_cm,
        "units": "cm" if max_length_cm is not None else None,
        "output_file_mp4": None,
        "min_length_cm": quality.get("min_length_cm"),
        "max_length_cm": max_length_cm,
        "confidence_score": quality.get("confidence_score"),
        "low_confidence": quality.get("low_confidence"),
        "in_progress": False,
    }


# Part 3. Public service entrypoint used by API and pipeline callers.
def run_linear_measurements(
    *,
    sop_instance_uid: str,
    model_weights: str,
    force: bool,
    db: Session,
    artifact_set_id: int | None = None,
    skip_orthanc_check: bool = False,
    defer_model_unload: bool = False,
):
    model_weights = model_weights.strip().lower()
    if model_weights not in VALID_2D_WEIGHTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model_weights '{model_weights}'",
        )

    if (not skip_orthanc_check) and (
        not check_instance_exists_in_orthanc(sop_instance_uid)
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Instance with sop_instance_uid={sop_instance_uid} not found in Orthanc.",
        )

    instance, existing = _resolve_instance_and_existing(
        db=db,
        sop_instance_uid=sop_instance_uid,
        model_weights=model_weights,
        artifact_set_id=artifact_set_id,
    )
    if (
        (not force)
        and existing
        and isinstance(existing.value_json, dict)
        and is_structured_overlay(existing.value_json)
    ):
        return _cached_response(
            payload=existing.value_json,
            sop_instance_uid=sop_instance_uid,
            model_weights=model_weights,
        )

    lock_dir = os.path.join(
        LOCK_ROOT,
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
                "overlay_type": LINEAR_MEASUREMENT_OVERLAY_TYPE,
                "overlay_key": model_weights,
                "kind": LINEAR_MEASUREMENT_OVERLAY_KIND,
                "has_overlay": False,
                "output_file_mp4": None,
                "min_length_cm": None,
                "max_length_cm": None,
                "in_progress": True,
            }
        with open(lock_path, "w", encoding="utf-8") as lock_file:
            lock_file.write("running")
    except Exception:
        pass

    try:
        return _run_structured(
            instance=instance,
            model_weights=model_weights,
            db=db,
            artifact_set_id=artifact_set_id,
            defer_model_unload=defer_model_unload,
        )
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("[LinearMeasurements] Inference failed")
        raise HTTPException(status_code=500, detail=f"Inference failed: {err}") from err
    finally:
        try:
            if os.path.exists(lock_path):
                os.remove(lock_path)
        except Exception:
            pass


__all__ = [
    "run_linear_measurements",
    "unload_2d_models",
]
