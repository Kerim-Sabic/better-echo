import os
from typing import Optional

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from app.database.db import get_db
from app.database_models.instances import Instance
from app.database_models.derived_results import DerivedResult
from app.helpers.inference_runtime.inference_functions import check_instance_exists_in_orthanc
from app.AI_models.measurements.runner_2d import run_2d_inference, VALID_2D_WEIGHTS
from app.schemas.inference.infer_measurements_schemas import Measurements2DResponse
from app.core.artifacts import BASE_DIR


logger = logging.getLogger(__name__)
router = APIRouter()

# Paths
UPLOADS_ROOT = os.path.normpath(os.path.join(BASE_DIR, "..", "uploads"))  # backend/app/uploads
os.makedirs(UPLOADS_ROOT, exist_ok=True)

def _rel_uploads(p: str | None) -> str | None:
    if not p:
        return None
    try:
        rp = os.path.relpath(p, UPLOADS_ROOT)
        return rp.replace("\\", "/")
    except Exception:
        return p


@router.post("/infer/measurements/2d", response_model=Measurements2DResponse)
def infer_measurements_2d(
    sop_instance_uid: str = Query(..., description="DICOM SOPInstanceUID to run 2D measurement annotation on"),
    model_weights: str = Query(..., description=f"One of: {', '.join(sorted(list(VALID_2D_WEIGHTS)))}"),
    force: bool = Query(False, description="Force re-run even if a cached result exists"),
    artifact_set_id: Optional[int] = Query(default=None, include_in_schema=False),
    skip_orthanc_check: bool = Query(default=False, include_in_schema=False),
    db: Session = Depends(get_db),
):
    """
    Perform 2D linear measurement annotation using EchoNet-Measurements and return an annotated MP4 plus summary metrics.

    Steps:
    1. Validate that the instance exists in Orthanc and resolve the local DICOM file path.
    2. Derive a study-specific output directory under `uploads/measurements_2D_keypoint_detection`.
    3. Check for a cached DerivedResult unless `force=true`, returning cached MP4/min/max if available.
    4. Use a lockfile to avoid duplicate concurrent inferences for the same instance/weights.
    5. Run `run_2d_inference` to produce an annotated MP4 and CSV, then derive min/max lengths from the CSV.
    6. Persist a DerivedResult row with MP4 path and measurements, clean up lock + temporary files, and return the response payload.
    """
    model_weights = model_weights.strip().lower()
    if model_weights not in VALID_2D_WEIGHTS:
        raise HTTPException(status_code=400, detail=f"Invalid model_weights '{model_weights}'")

    # --- Step 1: Validate Orthanc presence (optional in queue-worker path) ---
    if (not skip_orthanc_check) and (not check_instance_exists_in_orthanc(sop_instance_uid)):
        raise HTTPException(status_code=400, detail=f"Instance with sop_instance_uid={sop_instance_uid} not found in Orthanc.")

    # --- Step 2: Resolve instance + local file path ---
    instance: Optional[Instance] = db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    if not instance or not instance.file_path or not os.path.exists(instance.file_path):
        raise HTTPException(status_code=400, detail="Local file path for the instance not found.")

    input_path = instance.file_path
    logger.info(f"[Measurements2D] Starting inference: {sop_instance_uid}, model_weights={model_weights}")

    # --- Step 3: Ensure output directory under uploads/measurements_2D_keypoint_detection/<study_uid>/<sop_instance_uid> ---
    try:
        study_uid = instance.series.study.study_uid
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to resolve Study UID for the instance.")
    uploads_measurements_root = os.path.join(UPLOADS_ROOT, "measurements_2D_keypoint_detection")
    out_dir = os.path.join(uploads_measurements_root, study_uid, sop_instance_uid)
    os.makedirs(out_dir, exist_ok=True)

    # --- Step 4: Try cached DerivedResult (unless forced) ---
    dr_type = f"EchoNetMeasurements2D_{model_weights}"
    existing = (
        db.query(DerivedResult)
        .filter(DerivedResult.instance_id == instance.id, DerivedResult.type == dr_type)
        .order_by(DerivedResult.id.desc())
        .first()
    )
    if (not force) and existing and isinstance(existing.value_json, dict):
        try:
            payload = existing.value_json
            out_mp4_rel = payload.get("outputfile")
            # Validate artifact exists under uploads
            if not out_mp4_rel:
                raise Exception("No cached outputfile path")
            abs_mp4 = os.path.join(UPLOADS_ROOT, out_mp4_rel)
            if not os.path.exists(abs_mp4):
                raise Exception("Cached artifact missing, recomputing")
            min_len_cm = payload.get("min_length_cm")
            max_len_cm = payload.get("max_length_cm")
            return Measurements2DResponse(
                success=True,
                message="Cached result returned",
                sop_instance_uid=sop_instance_uid,
                model_weights=model_weights,
                output_file_mp4=out_mp4_rel,
                min_length_cm=min_len_cm,
                max_length_cm=max_len_cm,
                in_progress=False,
            )
        except Exception:
            pass

    # --- Step 5: Guard against duplicate runs via a lockfile ---
    lock_path = os.path.join(out_dir, f"{model_weights}.lock")
    try:
        if os.path.exists(lock_path):
            # If lock exists, signal that an inference is in progress
            return Measurements2DResponse(
                success=True,
                message="Inference in progress",
                sop_instance_uid=sop_instance_uid,
                model_weights=model_weights,
                output_file_mp4=None,
                min_length_cm=None,
                max_length_cm=None,
                in_progress=True,
            )
        # create lock
        with open(lock_path, "w") as f:
            f.write("running")
    except Exception:
        # best-effort; continue
        pass

    # --- Step 6: Run model inference (creates MP4 + CSV) ---
    try:
        out_video, out_csv = run_2d_inference(model_weights=model_weights, input_path=input_path, output_dir=out_dir)
    except Exception as e:
        logger.exception("[Measurements2D] Inference failed")
        try:
            if os.path.exists(lock_path):
                os.remove(lock_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")

    logger.info(f"[Measurements2D] Completed. Output video: {out_video}")

    # --- Step 7: Finalize MP4 output path ---
    out_mp4 = None
    try:
        if not out_video.lower().endswith(".mp4"):
            logger.warning("[Measurements2D] Unexpected non-MP4 output: %s", out_video)
        out_mp4 = os.path.normpath(out_video).replace("\\", "/")
    except Exception as e:
        logger.warning(f"[Measurements2D] Failed to finalize MP4 output path: {e}")

    # --- Step 8: Compute ES/ED (min/max) from CSV when available ---
    min_len_cm = None
    max_len_cm = None
    try:
        import pandas as pd
        df = pd.read_csv(out_csv)
        if "length_cm" in df.columns:
            # Drop NaNs and non-positive values
            vals = pd.to_numeric(df["length_cm"], errors="coerce").dropna()
            if not vals.empty:
                min_len_cm = float(vals.min())
                max_len_cm = float(vals.max())
    except Exception as e:
        logger.warning(f"[Measurements2D] Failed to parse lengths from CSV: {e}")

    # Delete CSV after MP4 creation (doctor only needs MP4)
    if out_mp4:
        try:
            if os.path.exists(out_csv):
                os.remove(out_csv)
        except Exception:
            pass

    # --- Step 9: Persist DerivedResult for reuse ---
    try:
        payload = {
            "outputfile": _rel_uploads(out_mp4) if out_mp4 else None,
            "min_length_cm": min_len_cm,
            "max_length_cm": max_len_cm,
            "model_weights": model_weights,
        }
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
                    model_name="EchoNetMeasurements2D",
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
                model_name="EchoNetMeasurements2D",
                model_version="v1",
            )
            db.add(dr)
        db.commit()
    except Exception as e:
        logger.warning(f"[Measurements2D] Failed to persist DerivedResult: {e}")

    # --- Step 10: Cleanup lock and respond ---
    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except Exception:
        pass

    # --- Step 11: Respond ---
    return {
        "success": True,
        "message": "Inference completed",
        "sop_instance_uid": sop_instance_uid,
        "model_weights": model_weights,
        "output_file_mp4": _rel_uploads(out_mp4),
        "min_length_cm": min_len_cm,
        "max_length_cm": max_len_cm,
        "in_progress": False,
    }

