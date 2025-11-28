from typing import Optional, Dict, Any, List
import os
import tempfile
import shutil
import json
import threading
from typing import Callable

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging
import requests
import torch

from app.AI_models.EchoPrime.echo_prime import EchoPrime
from app.helpers.inference_functions import fetch_orthanc_instance_ids_from_study
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
                _ep = EchoPrime()
                device = getattr(_ep, "device", None)
                logger.info("[EchoPrime] Model initialized on device=%s", device)
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
        ep = get_ep()
        if warmup:
            _warmup_ep(ep)
        device = getattr(ep, "device", None)
        logger.info("[EchoPrime] Preload finished (warmup=%s, device=%s)", warmup, device)
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


def download_dicoms_for_study(instance_ids: List[str]) -> str:
    """
    Download all DICOMs for a study into a temporary folder.
    Returns the folder path.
    """
    tmp_dir = tempfile.mkdtemp(prefix="echoprime_study_")
    for iid in instance_ids:
        r = requests.get(
            f"{orthanc_url}/instances/{iid}/file",
            auth = (orthanc_user, orthanc_pass),
            stream=True
        )
        r.raise_for_status()
        filepath = os.path.join(tmp_dir, f"{iid}.dcm")
        with open(filepath, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    return tmp_dir


@router.post("/infer/echoprime", response_model=EchoPrimeResponse)
def infer_echoprime(
    payload: InferEchoPrimeRequest,
    db: Session = Depends(get_db)
    ) -> Dict[str, Any]:
    """
    Run EchoPrime inference for a study (multi-video DICOM input) and return predictions plus a generated report text.

    Steps:
    1. Resolve the study by `study_uid` and log the request.
    2. Load or reuse the resident EchoPrime model (lazy fallback if preload failed).
    3. Fetch all Orthanc instance IDs for the study and download the DICOM files into a temporary folder.
    4. Run the EchoPrime pipeline to encode the study and obtain predictions and a report.
    5. Persist a DerivedResult row with predictions + report for the study, clean up temp files, and return the results.
    """

    study_uid = payload.study_uid

    logger.info(f"[EchoPrime] infer_echoprime called with study_uid={study_uid}")

    ep = get_ep()  # model is loaded on first request
    # --- Step 1: fetch instances from Orthanc ---
    instance_orthanc_ids = fetch_orthanc_instance_ids_from_study(study_uid)
    
    # --- Step 2: download dicoms ---
    study_dir = download_dicoms_for_study(instance_orthanc_ids)

    try:
        # --- Step 3: run model pipeline ---
        stack_of_videos = ep.process_dicoms(study_dir)
        encoded_study = ep.encode_study(stack_of_videos, visualize=False)

        predictions = ep.predict_metrics(encoded_study) # dict of predictions
        report_text = ep.generate_report(encoded_study) # report

        # --- Step 4: persist results to DB ---

        study = db.query(Study).filter(Study.study_uid == study_uid).first()
        if study:
            # Store generated report as JSON
            dr_report = DerivedResult(
                study_id = study.id,
                type="EchoPrime_AllTasks_and_Report",
                value_json=json.dumps({
                    "predictions": predictions,
                    "report": report_text}),
                model_name="EchoPrime",
                model_version="v1"
            )
            db.add(dr_report)
            db.commit()
            db.refresh(dr_report)

        logger.info(f"[EchoPrime] Inference completed for study_uid={study_uid}")
        return {
            "study_uid": study_uid,
            "num_instances": len(instance_orthanc_ids),
            "predictions": predictions,
            "report": report_text
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
