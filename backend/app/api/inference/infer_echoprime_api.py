import time
from typing import Optional, Dict, Any, List
import os
import tempfile
import shutil
import threading
from typing import Callable

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging
import requests
import torch

from app.AI_models.EchoPrime.echo_prime import EchoPrime
from app.helpers.inference_runtime.inference_functions import fetch_orthanc_instance_ids_from_study
from app.core.config import settings
from app.schemas.inference.infer_echoprime_schemas import (EchoPrimeResponse,
                                                 InferEchoPrimeRequest)

from app.database.db import get_db
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult

orthanc_url = settings.ORTHANC_URL
orthanc_user = settings.ORTHANC_USER
orthanc_pass = settings.ORTHANC_PASS

logger = logging.getLogger(__name__)
router = APIRouter()

# Lazy loading the EchoPrime model
_ep: Optional[EchoPrime] = None
_ep_lock = threading.Lock()
_preload_thread: Optional[threading.Thread] = None

def get_ep() -> EchoPrime:
    global _ep
    if _ep is not None:
        return _ep
    with _ep_lock:
        if _ep is None:
            try:
                start = time.time()
                _ep = EchoPrime()
                device = getattr(_ep, "device", None)
                logger.info("[EchoPrime] Model initialized on device=%s in %.1fs", device, time.time() - start)
            except Exception as exc:
                logger.exception("Failed to initialize EchoPrime: %s", exc)
                raise HTTPException(status_code=500, detail=f"EchoPrime initialization failed: {exc}")
    return _ep


def _warmup_ep(ep: EchoPrime) -> None:
    try:
        dummy = torch.zeros((1, 3, 16, 224, 224), device=ep.device)
        with torch.no_grad():
            _ = ep.echo_encoder(dummy)
            _ = ep.view_classifier(dummy[:, :, 0, :, :])
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        logger.info("[EchoPrime] Warmup completed")
    except Exception as exc:
        logger.warning("[EchoPrime] Warmup skipped due to error: %s", exc)


def preload_echoprime(warmup: bool = False) -> Optional[EchoPrime]:
    try:
        start = time.time()
        ep = get_ep()
        if warmup:
            _warmup_ep(ep)
        device = getattr(ep, "device", None)
        logger.info("[EchoPrime] Preload finished (warmup=%s, device=%s) in %.1fs", warmup, device, time.time() - start)
        return ep
    except HTTPException as exc:
        logger.warning("[EchoPrime] Preload failed; will fallback to lazy load: %s", exc.detail)
        return None


def _run_async(task: Callable[[], None]) -> None:
    global _preload_thread
    if _preload_thread and _preload_thread.is_alive():
        return
    _preload_thread = threading.Thread(target=task, name="echoprime-preload", daemon=True)
    _preload_thread.start()


def start_echoprime_preload_background(warmup: bool = False) -> None:
    _run_async(lambda: preload_echoprime(warmup))

def unload_ep() -> None:
    """Unload the EchoPrime model and free memory"""
    global _ep
    with _ep_lock:
        if _ep is not None:
            del _ep
            _ep = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            import gc
            gc.collect()
            logger.info("[EchoPrime] Model unloaded and memory cleared")


def download_dicoms_for_study(instance_ids: List[str]) -> List[Dict[str, str]]:
    """
    Download all DICOMs for a study into a temporary folder.
    Returns a list of dicts with instance_id and local path.
    """
    tmp_dir = tempfile.mkdtemp(prefix="echoprime_study_")
    records: List[Dict[str, str]] = []
    for idx, iid in enumerate(instance_ids):
        r = requests.get(
            f"{orthanc_url}/instances/{iid}/file",
            auth = (orthanc_user, orthanc_pass),
            stream=True
        )
        r.raise_for_status()
        # Preserve ordering with zero-padded index to align with glob ordering
        filepath = os.path.join(tmp_dir, f"{idx:05d}_{iid}.dcm")
        with open(filepath, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        records.append({"instance_id": iid, "path": filepath})
    return records


@router.post("/infer/echoprime", response_model=EchoPrimeResponse)
def infer_echoprime(
    payload: InferEchoPrimeRequest,
    db: Session = Depends(get_db)
    ) -> Dict[str, Any]:
    """
    Run EchoPrime inference for a study (multi-video DICOM input) and return predictions (metrics only, no text report).

    Steps:
    1. Resolve the study by `study_uid` and log the request.
    2. Load or reuse the resident EchoPrime model (lazy fallback if preload failed).
    3. Fetch all Orthanc instance IDs for the study and download the DICOM files into a temporary folder.
    4. Run the EchoPrime pipeline to encode the study and obtain predictions.
    5. Persist a DerivedResult row with predictions for the study, clean up temp files, and return the results.
    """

    study_uid = payload.study_uid

    logger.info(f"[EchoPrime] infer_echoprime called with study_uid={study_uid}")

    ep = get_ep()  # model is loaded on first request
    # --- Step 1: resolve input instance set ---
    instance_orthanc_ids = payload.include_instance_orthanc_ids or fetch_orthanc_instance_ids_from_study(study_uid)
    if not instance_orthanc_ids:
        raise HTTPException(status_code=404, detail=f"No instances found for study_uid={study_uid}")
    
    # --- Step 2: download dicoms ---
    downloaded = download_dicoms_for_study(instance_orthanc_ids)
    study_dir = os.path.dirname(downloaded[0]["path"]) if downloaded else tempfile.mkdtemp(prefix="echoprime_study_empty_")

    try:
        # --- Step 3: run model pipeline ---
        stack_of_videos = ep.process_dicoms(study_dir)
        encoded_study = ep.encode_study(stack_of_videos, visualize=False)

        predictions = ep.predict_metrics(encoded_study)  # dict of predictions

        # --- Step 3.1: Persist per-instance views from EchoPrime to Instance rows ---
        from app.database_models.instances import Instance

        view_list, view_confidence_list = ep.get_views(
            stack_of_videos,
            visualize=False,
            return_view_list=True,
            return_scores=True,
        )
        path_to_instance: Dict[str, str] = {os.path.abspath(rec["path"]): rec["instance_id"] for rec in downloaded}
        dicom_paths = sorted(path_to_instance.keys())
        updated = 0
        for idx, path in enumerate(dicom_paths):
            if idx >= len(view_list):
                break
            orthanc_instance_id = path_to_instance.get(path)
            if not orthanc_instance_id:
                continue
            inst = (
                db.query(Instance)
                .filter(Instance.instance_orthanc_id == orthanc_instance_id)
                .first()
            )
            if not inst:
                continue
            view_label = view_list[idx]
            view_conf = float(view_confidence_list[idx]) if idx < len(view_confidence_list) else None
            inst.predicted_view = str(view_label).upper() if view_label else None
            inst.predicted_view_confidence = view_conf
            db.add(inst)
            updated += 1
        if updated:
            db.commit()

        # --- Step 4: persist results to DB ---

        study = db.query(Study).filter(Study.study_uid == study_uid).first()
        if study:
            # --- Step 4.1 Queue mode writes into draft-scoped artifact set ---
            if payload.artifact_set_id is not None:
                dr_report = (
                    db.query(DerivedResult)
                    .filter(
                        DerivedResult.study_id == study.id,
                        DerivedResult.type == "EchoPrime_AllTasks",
                        DerivedResult.artifact_set_id == payload.artifact_set_id,
                    )
                    .first()
                )
                if not dr_report:
                    dr_report = DerivedResult(
                        study_id=study.id,
                        type="EchoPrime_AllTasks",
                        model_name="EchoPrime",
                        model_version="v1",
                        artifact_set_id=payload.artifact_set_id,
                    )
                    db.add(dr_report)
            else:
                dr_report = DerivedResult(
                    study_id=study.id,
                    type="EchoPrime_AllTasks",
                    model_name="EchoPrime",
                    model_version="v1",
                )
                db.add(dr_report)

            dr_report.value_json = {
                "predictions": predictions,
            }
            db.commit()
            db.refresh(dr_report)

        logger.info(f"[EchoPrime] Inference completed for study_uid={study_uid}")
        return {
            "study_uid": study_uid,
            "num_instances": len(instance_orthanc_ids),
            "predictions": predictions
        }
    
    except Exception as e:
        logger.exception(f"[EchoPrime] Inference failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"EchoPrime inference failed: {type(e).__name__}: {e}")
    
    finally:
         # --- Step 5: cleanup temp files ---
        try:
            shutil.rmtree(study_dir)
        except Exception:
            pass

