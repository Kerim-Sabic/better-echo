import os
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.AI_models.measurements.constants import VALID_2D_WEIGHTS
from app.core.artifacts import (
    LINEAR_MEASUREMENTS_MODEL_NAME,
    LINEAR_MEASUREMENTS_UPLOAD_DIRNAME,
    UPLOAD_DIR,
    linear_measurements_result_type,
)
from app.core.config import settings
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.helpers.inference_runtime.inference_functions import check_instance_exists_in_orthanc

import logging


logger = logging.getLogger(__name__)

UPLOADS_ROOT = UPLOAD_DIR
os.makedirs(UPLOADS_ROOT, exist_ok=True)


def rel_linear_measurements_upload_path(path: str | None) -> str | None:
    if not path:
        return None
    try:
        rel_path = os.path.relpath(path, UPLOADS_ROOT)
        return rel_path.replace("\\", "/")
    except Exception:
        return path


def run_linear_measurements(
    *,
    sop_instance_uid: str,
    model_weights: str,
    force: bool,
    db: Session,
    artifact_set_id: Optional[int] = None,
    skip_orthanc_check: bool = False,
    defer_model_unload: bool = False,
):
    model_weights = model_weights.strip().lower()
    if model_weights not in VALID_2D_WEIGHTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model_weights '{model_weights}'",
        )
    from app.AI_models.measurements.runner_2d import run_2d_inference, unload_2d_models

    unload_after_request = (
        str(settings.PIPELINE_UNLOAD_POLICY).strip().lower() == "stage"
        or str(settings.INFERENCE_PROFILE).strip().lower() == "low_vram"
    )

    if (not skip_orthanc_check) and (
        not check_instance_exists_in_orthanc(sop_instance_uid)
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Instance with sop_instance_uid={sop_instance_uid} not found in Orthanc.",
        )

    instance: Optional[Instance] = (
        db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    )
    if not instance or not instance.file_path or not os.path.exists(instance.file_path):
        raise HTTPException(
            status_code=400,
            detail="Local file path for the instance not found.",
        )

    input_path = instance.file_path
    logger.info(
        "[LinearMeasurements] Starting inference: %s, weights=%s",
        sop_instance_uid,
        model_weights,
    )

    try:
        study_uid = instance.series.study.study_uid
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to resolve Study UID for the instance.",
        )
    uploads_measurements_root = os.path.join(
        UPLOADS_ROOT,
        LINEAR_MEASUREMENTS_UPLOAD_DIRNAME,
    )
    out_dir = os.path.join(uploads_measurements_root, study_uid, sop_instance_uid)
    os.makedirs(out_dir, exist_ok=True)

    derived_result_type = linear_measurements_result_type(model_weights)
    existing = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.instance_id == instance.id,
            DerivedResult.type == derived_result_type,
        )
        .order_by(DerivedResult.id.desc())
        .first()
    )
    if (not force) and existing and isinstance(existing.value_json, dict):
        try:
            payload = existing.value_json
            out_mp4_rel = payload.get("outputfile")
            if not out_mp4_rel:
                raise RuntimeError("No cached outputfile path")
            abs_mp4 = os.path.join(UPLOADS_ROOT, out_mp4_rel)
            if not os.path.exists(abs_mp4):
                raise RuntimeError("Cached artifact missing, recomputing")
            return {
                "success": True,
                "message": "Cached result returned",
                "sop_instance_uid": sop_instance_uid,
                "model_weights": model_weights,
                "output_file_mp4": out_mp4_rel,
                "min_length_cm": payload.get("min_length_cm"),
                "max_length_cm": payload.get("max_length_cm"),
                "in_progress": False,
            }
        except Exception:
            pass

    lock_path = os.path.join(out_dir, f"{model_weights}.lock")
    try:
        if os.path.exists(lock_path):
            return {
                "success": True,
                "message": "Inference in progress",
                "sop_instance_uid": sop_instance_uid,
                "model_weights": model_weights,
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
        out_video, out_csv = run_2d_inference(
            model_weights=model_weights,
            input_path=input_path,
            output_dir=out_dir,
        )
    except Exception as err:
        logger.exception("[LinearMeasurements] Inference failed")
        try:
            if os.path.exists(lock_path):
                os.remove(lock_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Inference failed: {err}")
    finally:
        if unload_after_request and (not defer_model_unload):
            unload_2d_models()

    logger.info("[LinearMeasurements] Completed. Output video: %s", out_video)

    try:
        out_mp4 = os.path.normpath(out_video).replace("\\", "/")
        if not out_video.lower().endswith(".mp4"):
            logger.warning(
                "[LinearMeasurements] Unexpected non-MP4 output: %s",
                out_video,
            )
    except Exception as err:
        out_mp4 = None
        logger.warning(
            "[LinearMeasurements] Failed to finalize MP4 output path: %s",
            err,
        )

    min_len_cm = None
    max_len_cm = None
    try:
        import pandas as pd

        dataframe = pd.read_csv(out_csv)
        if "length_cm" in dataframe.columns:
            values = (
                pd.to_numeric(dataframe["length_cm"], errors="coerce").dropna()
            )
            if not values.empty:
                min_len_cm = float(values.min())
                max_len_cm = float(values.max())
    except Exception as err:
        logger.warning(
            "[LinearMeasurements] Failed to parse lengths from CSV: %s",
            err,
        )

    if out_mp4:
        try:
            if os.path.exists(out_csv):
                os.remove(out_csv)
        except Exception:
            pass

    try:
        payload = {
            "outputfile": rel_linear_measurements_upload_path(out_mp4)
            if out_mp4
            else None,
            "min_length_cm": min_len_cm,
            "max_length_cm": max_len_cm,
            "model_weights": model_weights,
        }
        if artifact_set_id is not None:
            derived_result = (
                db.query(DerivedResult)
                .filter(
                    DerivedResult.instance_id == instance.id,
                    DerivedResult.type == derived_result_type,
                    DerivedResult.artifact_set_id == artifact_set_id,
                )
                .order_by(DerivedResult.id.desc())
                .first()
            )
            if not derived_result:
                derived_result = DerivedResult(
                    study_id=instance.series.study.id,
                    instance_id=instance.id,
                    type=derived_result_type,
                    model_name=LINEAR_MEASUREMENTS_MODEL_NAME,
                    model_version="v1",
                    artifact_set_id=artifact_set_id,
                )
                db.add(derived_result)
            derived_result.value_json = payload
        else:
            db.add(
                DerivedResult(
                    study_id=instance.series.study.id,
                    instance_id=instance.id,
                    type=derived_result_type,
                    value_json=payload,
                    model_name=LINEAR_MEASUREMENTS_MODEL_NAME,
                    model_version="v1",
                )
            )
        db.commit()
    except Exception as err:
        logger.warning(
            "[LinearMeasurements] Failed to persist DerivedResult: %s",
            err,
        )

    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except Exception:
        pass

    return {
        "success": True,
        "message": "Inference completed",
        "sop_instance_uid": sop_instance_uid,
        "model_weights": model_weights,
        "output_file_mp4": rel_linear_measurements_upload_path(out_mp4),
        "min_length_cm": min_len_cm,
        "max_length_cm": max_len_cm,
        "in_progress": False,
    }
