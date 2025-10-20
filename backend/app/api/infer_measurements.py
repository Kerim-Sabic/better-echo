import os
from typing import Optional

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from app.database.db import get_db
from app.models.instances import Instance
from app.models.derived_results import DerivedResult
from app.helpers.inference_functions import check_instance_exists_in_orthanc
from app.AI_models.measurements.runner_2d import run_2d_inference, VALID_2D_WEIGHTS
from app.schemas.infer_measurements_schemas import Measurements2DResponse
from app.helpers.AVI_to_MP4_converter import convert_to_mp4


logger = logging.getLogger(__name__)
router = APIRouter()

# Artifacts directory for outputs
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/app/api
ARTIFACTS_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "artifacts", "measurements", "2d"))
os.makedirs(ARTIFACTS_DIR, exist_ok=True)


@router.post("/infer/measurements/2d", response_model=Measurements2DResponse)
def infer_measurements_2d(
    sop_instance_uid: str = Query(..., description="DICOM SOPInstanceUID to run 2D measurement annotation on"),
    model_weights: str = Query(..., description=f"One of: {', '.join(sorted(list(VALID_2D_WEIGHTS)))}"),
    force: bool = Query(False, description="Force re-run even if a cached result exists"),
    db: Session = Depends(get_db),
):
    """Perform 2D linear measurement annotation using EchoNet-Measurements.

    Returns annotated video and CSV. Caches results per (instance, task) as
    DerivedResult so subsequent calls can reuse artifacts unless `force=true`.
    """
    model_weights = model_weights.strip().lower()
    if model_weights not in VALID_2D_WEIGHTS:
        raise HTTPException(status_code=400, detail=f"Invalid model_weights '{model_weights}'")

    # --- Step 1: Validate Orthanc presence ---
    if not check_instance_exists_in_orthanc(sop_instance_uid):
        raise HTTPException(status_code=400, detail=f"Instance with sop_instance_uid={sop_instance_uid} not found in Orthanc.")

    # --- Step 2: Resolve instance + local file path ---
    instance: Optional[Instance] = db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    if not instance or not instance.file_path or not os.path.exists(instance.file_path):
        raise HTTPException(status_code=400, detail="Local file path for the instance not found.")

    input_path = instance.file_path
    logger.info(f"[Measurements2D] Starting inference: {sop_instance_uid}, model_weights={model_weights}")

    # --- Step 3: Ensure output directory ---
    out_dir = os.path.join(ARTIFACTS_DIR, sop_instance_uid)
    os.makedirs(out_dir, exist_ok=True)

    # --- Step 4: Try cached DerivedResult (unless forced) ---
    dr_type = f"EchoNetMeasurements2D_{model_weights}"
    existing = (
        db.query(DerivedResult)
        .filter(DerivedResult.instance_id == instance.id, DerivedResult.type == dr_type)
        .order_by(DerivedResult.id.desc())
        .first()
    )
    if (not force) and existing and existing.value_json:
        try:
            import json
            payload = json.loads(existing.value_json)
            out_mp4 = payload.get("outputfile")
            out_csv = payload.get("csv_file")
            # Validate artifacts exist; if missing, ignore cache
            base_dir2 = os.path.dirname(os.path.abspath(__file__))
            artifacts_root = os.path.normpath(os.path.join(base_dir2, "..", "artifacts"))
            ok_files = True
            for rel in [out_mp4, out_csv]:
                if rel:
                    fullp = os.path.join(artifacts_root, rel)
                    if not os.path.exists(fullp):
                        ok_files = False
                        break
            if not ok_files:
                raise Exception("Cached artifacts missing, recomputing")
            min_len_cm = payload.get("min_length_cm")
            max_len_cm = payload.get("max_length_cm")
            return Measurements2DResponse(
                success=True,
                message="Cached result returned",
                sop_instance_uid=sop_instance_uid,
                model_weights=model_weights,
                output_file=None,
                csv_file=out_csv,
                output_file_mp4=out_mp4,
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
                output_file=None,
                csv_file=None,
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

    # --- Step 6: Run model inference (creates AVI + CSV) ---
    try:
        out_avi, out_csv = run_2d_inference(model_weights=model_weights, input_path=input_path, output_dir=out_dir)
    except Exception as e:
        logger.exception("[Measurements2D] Inference failed")
        try:
            if os.path.exists(lock_path):
                os.remove(lock_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")

    logger.info(f"[Measurements2D] Completed. Output AVI: {out_avi}")

    # --- Step 7: Convert AVI -> MP4 (and remove AVI) ---
    out_mp4 = None
    try:
        out_mp4_path = convert_to_mp4(out_avi)
        out_mp4 = os.path.normpath(out_mp4_path).replace("\\", "/")
        # Remove the original AVI to save space
        try:
            os.remove(out_avi)
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"[Measurements2D] MP4 conversion failed: {e}")

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

    # --- Step 9: Convert absolute paths -> artifacts-relative ---
    base_dir = os.path.dirname(os.path.abspath(__file__))
    artifacts_dir = os.path.normpath(os.path.join(base_dir, "..", "artifacts"))
    def _rel(p: str | None) -> str | None:
        if not p:
            return None
        try:
            rp = os.path.relpath(p, artifacts_dir)
            return rp.replace("\\", "/")
        except Exception:
            return p

    # --- Step 10: Persist DerivedResult for reuse ---
    try:
        import json as _json
        payload = {
            "outputfile": _rel(out_mp4) if out_mp4 else _rel(out_avi),
            "csv_file": _rel(out_csv),
            "min_length_cm": min_len_cm,
            "max_length_cm": max_len_cm,
            "model_weights": model_weights,
        }
        dr = DerivedResult(
            study_id=instance.series.study.id,
            instance_id=instance.id,
            type=dr_type,
            value_numeric=None,
            value_json=_json.dumps(payload),
            units="cm",
            model_name="EchoNetMeasurements2D",
            model_version="v1",
        )
        db.add(dr)
        db.commit()
    except Exception as e:
        logger.warning(f"[Measurements2D] Failed to persist DerivedResult: {e}")

    # --- Step 11: Cleanup lock and respond ---
    try:
        if os.path.exists(lock_path):
            os.remove(lock_path)
    except Exception:
        pass

    # --- Step 12: Respond ---
    return Measurements2DResponse(
        success=True,
        message="Inference completed",
        sop_instance_uid=sop_instance_uid,
        model_weights=model_weights,
        output_file=_rel(out_avi),
        csv_file=_rel(out_csv),
        output_file_mp4=_rel(out_mp4),
        min_length_cm=min_len_cm,
        max_length_cm=max_len_cm,
        in_progress=False,
    )
