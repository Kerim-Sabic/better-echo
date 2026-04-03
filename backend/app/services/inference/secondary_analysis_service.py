import logging
import os
import shutil
import tempfile
import threading
import time
from typing import Any, Callable, Dict, List, Optional

import requests
import torch
from sqlalchemy.orm import Session

from app.core.artifacts import (
    SECONDARY_ANALYSIS_MODEL_NAME,
    SECONDARY_ANALYSIS_TYPE,
    UPLOAD_DIR,
)
from app.core.config import settings
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.helpers.inference_runtime.inference_functions import fetch_orthanc_instance_ids_from_study

orthanc_url = settings.ORTHANC_URL
orthanc_user = settings.ORTHANC_USER
orthanc_pass = settings.ORTHANC_PASS

logger = logging.getLogger(__name__)


_ep: Optional[Any] = None
_ep_lock = threading.Lock()
_preload_thread: Optional[threading.Thread] = None


# Part 1. Secondary analysis model lifecycle helpers.
def get_secondary_analysis_model() -> Any:
    global _ep
    if _ep is not None:
        return _ep
    with _ep_lock:
        if _ep is None:
            from app.AI_models.EchoPrime.echo_prime import EchoPrime

            start = time.time()
            _ep = EchoPrime()
            device = getattr(_ep, "device", None)
            logger.info("[SecondaryAnalysis] Model initialized on device=%s in %.1fs", device, time.time() - start)
    return _ep


def _warmup_secondary_analysis(ep: Any) -> None:
    try:
        dummy = torch.zeros((1, 3, 16, 224, 224), device=ep.device)
        with torch.no_grad():
            _ = ep.echo_encoder(dummy)
            _ = ep.view_classifier(dummy[:, :, 0, :, :])
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        logger.info("[SecondaryAnalysis] Warmup completed")
    except Exception as exc:
        logger.warning("[SecondaryAnalysis] Warmup skipped due to error: %s", exc)


def preload_secondary_analysis(warmup: bool = False) -> Optional[Any]:
    try:
        start = time.time()
        ep = get_secondary_analysis_model()
        if warmup:
            _warmup_secondary_analysis(ep)
        device = getattr(ep, "device", None)
        logger.info("[SecondaryAnalysis] Preload finished (warmup=%s, device=%s) in %.1fs", warmup, device, time.time() - start)
        return ep
    except Exception as exc:
        logger.warning("[SecondaryAnalysis] Preload failed; will fallback to lazy load: %s", exc)
        return None


def _run_async(task: Callable[[], None]) -> None:
    global _preload_thread
    if _preload_thread and _preload_thread.is_alive():
        return
    _preload_thread = threading.Thread(target=task, name="secondary-analysis-preload", daemon=True)
    _preload_thread.start()


def start_secondary_analysis_preload_background(warmup: bool = False) -> None:
    _run_async(lambda: preload_secondary_analysis(warmup))


def unload_secondary_analysis_model() -> None:
    global _ep
    with _ep_lock:
        if _ep is None:
            return
        del _ep
        _ep = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        import gc
        gc.collect()
        logger.info("[SecondaryAnalysis] Model unloaded and memory cleared")


# Part 2. Study input download and subset-build helpers.
def download_dicoms_for_study(instance_ids: List[str]) -> List[Dict[str, str]]:
    """
    Download all DICOMs for a study into a temporary folder.
    Returns a list of dicts with instance_id and local path.
    """
    tmp_dir = tempfile.mkdtemp(prefix="secondary_analysis_study_")
    records: List[Dict[str, str]] = []
    for idx, iid in enumerate(instance_ids):
        response = requests.get(
            f"{orthanc_url}/instances/{iid}/file",
            auth=(orthanc_user, orthanc_pass),
            stream=True,
        )
        response.raise_for_status()
        filepath = os.path.join(tmp_dir, f"{idx:05d}_{iid}.dcm")
        with open(filepath, "wb") as output_file:
            for chunk in response.iter_content(chunk_size=8192):
                output_file.write(chunk)
        records.append({"instance_id": iid, "path": filepath})
    return records


def _build_subset_input_folder(file_paths: List[str]) -> tuple[str, str, bool]:
    temp_dir = tempfile.mkdtemp(prefix="secondary_analysis_view_subset_")
    for idx, src in enumerate(file_paths):
        dst = os.path.join(temp_dir, f"{idx:05d}_{os.path.basename(src)}")
        try:
            os.link(src, dst)
        except Exception:
            shutil.copy2(src, dst)
    return temp_dir, temp_dir, True


# Part 3. Secondary analysis metrics inference service entrypoint.
def run_secondary_analysis_metrics(
    *,
    study_uid: str,
    db: Session,
    include_instance_orthanc_ids: Optional[List[str]] = None,
    artifact_set_id: Optional[int] = None,
) -> Dict[str, object]:
    logger.info("[SecondaryAnalysis] infer called with study_uid=%s", study_uid)

    ep = get_secondary_analysis_model()
    instance_orthanc_ids = include_instance_orthanc_ids or fetch_orthanc_instance_ids_from_study(study_uid)
    if not instance_orthanc_ids:
        raise ValueError(f"No instances found for study_uid={study_uid}")

    downloaded = download_dicoms_for_study(instance_orthanc_ids)
    study_dir = os.path.dirname(downloaded[0]["path"]) if downloaded else tempfile.mkdtemp(prefix="secondary_analysis_study_empty_")

    try:
        stack_of_videos = ep.process_dicoms(study_dir)
        encoded_study = ep.encode_study(stack_of_videos, visualize=False)
        predictions = ep.predict_metrics(encoded_study)

        study = db.query(Study).filter(Study.study_uid == study_uid).first()
        if study:
            if artifact_set_id is not None:
                report_row = (
                    db.query(DerivedResult)
                    .filter(
                        DerivedResult.study_id == study.id,
                        DerivedResult.type == SECONDARY_ANALYSIS_TYPE,
                        DerivedResult.artifact_set_id == artifact_set_id,
                    )
                    .first()
                )
                if not report_row:
                    report_row = DerivedResult(
                        study_id=study.id,
                        type=SECONDARY_ANALYSIS_TYPE,
                        model_name=SECONDARY_ANALYSIS_MODEL_NAME,
                        model_version="v1",
                        artifact_set_id=artifact_set_id,
                    )
                    db.add(report_row)
            else:
                report_row = DerivedResult(
                    study_id=study.id,
                    type=SECONDARY_ANALYSIS_TYPE,
                    model_name=SECONDARY_ANALYSIS_MODEL_NAME,
                    model_version="v1",
                )
                db.add(report_row)

            report_row.value_json = {"predictions": predictions}
            db.commit()
            db.refresh(report_row)

        logger.info("[SecondaryAnalysis] Metrics inference completed for study_uid=%s", study_uid)
        return {
            "study_uid": study_uid,
            "num_instances": len(instance_orthanc_ids),
            "predictions": predictions,
        }
    finally:
        try:
            shutil.rmtree(study_dir)
        except Exception:
            pass


# Part 4. Secondary analysis view-classification service entrypoint.
def classify_views_for_study(
    study_uid: str,
    db: Session,
    include_file_paths: Optional[List[str]] = None,
) -> Dict[str, Dict[str, Optional[float | str]]]:
    """
    Use the secondary analysis view classifier to tag instances in a study.

    When include_file_paths is provided, only that subset is classified and persisted.
    Returns a mapping of SOPInstanceUID -> {view, confidence, file_path}.
    """
    study_folder = os.path.join(UPLOAD_DIR, study_uid)
    if not os.path.isdir(study_folder):
        raise FileNotFoundError(f"Study folder not found: {study_folder}")

    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise ValueError(f"Study not found in DB: {study_uid}")

    all_instances = (
        db.query(Instance)
        .join(Instance.series)
        .join(Series.study)
        .filter(Study.id == study.id)
        .all()
    )
    instances_by_path: Dict[str, Instance] = {
        os.path.abspath(row.file_path): row for row in all_instances if row.file_path
    }

    target_paths_set = (
        {os.path.abspath(path) for path in include_file_paths if path}
        if include_file_paths
        else None
    )
    target_instances = [
        instance for path, instance in instances_by_path.items() if (target_paths_set is None or path in target_paths_set)
    ]

    # Part 4.1 Reuse persisted classifier output when target instances already have predictions.
    if target_instances and all(instance.predicted_view for instance in target_instances):
        result_map: Dict[str, Dict[str, Optional[float | str]]] = {}
        for instance in target_instances:
            result_map[instance.sop_instance_uid] = {
                "view": instance.predicted_view,
                "confidence": instance.predicted_view_confidence,
                "file_path": instance.file_path,
            }
        logger.info(
            "[view_classifier] Using cached views for %d/%d instances in study %s",
            len(result_map),
            len(target_instances),
            study_uid,
        )
        return result_map

    study_disk_files = [
        os.path.abspath(os.path.join(study_folder, filename))
        for filename in sorted(os.listdir(study_folder))
        if os.path.isfile(os.path.join(study_folder, filename))
    ]
    if not study_disk_files:
        raise FileNotFoundError(f"No DICOM files found in {study_folder}")

    disk_files = (
        [path for path in study_disk_files if path in target_paths_set]
        if target_paths_set is not None
        else study_disk_files
    )
    if not disk_files:
        return {}

    input_folder = study_folder
    cleanup_path = ""
    requires_cleanup = False
    if target_paths_set is not None and len(disk_files) != len(study_disk_files):
        input_folder, cleanup_path, requires_cleanup = _build_subset_input_folder(disk_files)

    ep = get_secondary_analysis_model()
    try:
        stack_of_videos = ep.process_dicoms(input_folder)
        view_list, view_confidence_list = ep.get_views(
            stack_of_videos,
            visualize=False,
            return_view_list=True,
            return_scores=True,
        )
    finally:
        if requires_cleanup and cleanup_path:
            shutil.rmtree(cleanup_path, ignore_errors=True)

    prediction_count = len(view_list)
    if prediction_count != len(disk_files):
        logger.warning(
            "[view_classifier] Mismatch for study %s: %d predictions vs %d files",
            study_uid,
            prediction_count,
            len(disk_files),
        )

    # Part 4.2 Persist predictions to matching Instance rows.
    limit = min(prediction_count, len(disk_files))
    result_map: Dict[str, Dict[str, Optional[float | str]]] = {}
    for idx, file_path in enumerate(disk_files[:limit]):
        instance = instances_by_path.get(file_path)
        if not instance:
            continue
        label = view_list[idx]
        confidence = float(view_confidence_list[idx]) if idx < len(view_confidence_list) else None
        instance.predicted_view = str(label).upper() if label else None
        instance.predicted_view_confidence = confidence
        db.add(instance)
        result_map[instance.sop_instance_uid] = {
            "view": instance.predicted_view,
            "confidence": confidence,
            "file_path": file_path,
        }

    db.commit()
    logger.info(
        "[view_classifier] Saved views for %d/%d instances in study %s",
        len(result_map),
        len(target_instances) if target_paths_set is not None else len(all_instances),
        study_uid,
    )
    return result_map
