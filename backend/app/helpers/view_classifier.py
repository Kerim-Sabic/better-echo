from __future__ import annotations
import os
import glob
import logging
import gc
from typing import Dict, List, Tuple, Optional

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database_models.studies import Study
from app.database_models.series import Series
from app.database_models.instances import Instance
from app.database_models.patients import Patient
from app.database_models.derived_results import DerivedResult

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/app/helpers
UPLOAD_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "uploads"))

def _list_dicom_files_for_study_folder(study_folder: str) -> List[str]:
    """
    Returns a deterministic, sorted list of DICOM files found in the study folder.
    Adjust the glob pattern if your uploads include nested folders.
    """
    # Common DICOM extensions; Orthanc uploads might preserve original names
    patterns = ["*.dcm", "*.dicom", "*"]
    files: List[str] = []
    for pat in patterns:
        files.extend(glob.glob(os.path.join(study_folder, pat)))
    # Deduplicate and keep only files (no dirs), then sort for stable ordering
    files = sorted({f for f in files if os.path.isfile(f)})
    return files

def _unload_model(ep_obj) -> None:
    """Best-effort model unload to release CPU/GPU RAM."""
    try:
        import torch  # type: ignore
    except Exception:
        torch = None
    try:
        del ep_obj
    except Exception:
        pass
    gc.collect()
    if torch is not None and torch.cuda.is_available():
        try:
            torch.cuda.empty_cache()
        except Exception:
            pass

def view_classifier(study_uid: str, db: Session) -> Dict[str, Dict[str, Optional[float | str]]]:
    """
    Classify views for every Instance in the given study and persist results.
    """
    # --- Part 1. Resolve inputs & DB rows ---

    study_folder = os.path.join(UPLOAD_DIR, study_uid)
    if not os.path.isdir(study_folder):
        raise FileNotFoundError(f"Study folder not found: {study_folder}")
    
    # Part 1.1 Load the Study
    study: Optional[Study] = db.execute(
        select(Study).where(Study.study_uid == study_uid)
    ).scalar_one_or_none()
    if not study:
        raise ValueError(f"Study not found in DB: {study_uid}")
    
    # Part 1.2 Load Instances for this Study
    instances: List[Instance] = (
        db.query(Instance)
        .join(Instance.series)
        .join(Series.study)
        .filter(Study.id == study.id)
        .all()
    )
    if not instances:
        logger.warning(f"[view_classifier] No instances found in DB for study {study_uid}")
    
    # Part 1.3 Build lookups
    instance_by_path: Dict[str, Instance] = {os.path.abspath(i.file_path): i for i in instances if i.file_path}

    # Part 1.4 Deterministic file list discovered on disk
    disk_files = _list_dicom_files_for_study_folder(study_folder)
    if not disk_files:
        raise FileNotFoundError(f"No DICOM files found in {study_folder}")
    disk_files_abs = [os.path.abspath(p) for p in disk_files]

    # --- Part 2. Run EchoPrime (lazy) and compute confidences ---
    try:
        from app.AI_models.EchoPrime.echo_prime import EchoPrime
    except Exception as err:
        raise RuntimeError(
            "EchoPrime import failed. Make sure the package is installed and callable."
        ) from err

    ep = None
    try:
        ep = EchoPrime() # lazy load the model
        logger.info(f"[view_classifier] EchoPrime model is loaded.")
        # Part 2.1 Process the entire study folder once
        stack_of_videos = ep.process_dicoms(study_folder)

        # Part 2.2 Request both: a list of view strings and a list of probability confidences
        view_list, view_confidence_list = ep.get_views(
            stack_of_videos,
            visualize=False,
            return_view_list=True,
            return_scores=True,
        )

    except Exception as err:
        # Fail-fast with clear context
        raise RuntimeError(f"EchoPrime processing failed for {study_uid}: {err}") from err
    
    # --- Part 3. Persist predictions and cleanup
    result_map: Dict[str, Dict[str, Optional[float | str]]] = {}
    n_preds = len(view_list)
    n_files = len(disk_files_abs)   

    if n_preds != n_files:
        logger.warning(
            f"[view_classifier] Mismatch in lengths for study {study_uid}: "
            f"{n_preds} predictions vs {n_files} files. "
            "Proceeding with min length in sorted order."
        )
    
    limit = min(n_preds, n_files)
    for idx, file_path in enumerate(disk_files_abs[:limit]):
        label = view_list[idx]
        confidence = float(view_confidence_list[idx]) if idx < len(view_confidence_list) else None

        instance = instance_by_path.get(file_path)
        if not instance:
            # If direct path mapping fails (e.g., DB path uses a different canonical path),
            # you could fall back to DICOM-reading SOPInstanceUID mapping here.
            logger.warning(f"[view_classifier] No DB Instance match for file: {file_path}")
            continue

        # Part 3.1 Persist predicted view and confidence
        instance.predicted_view = str(label).upper() if label else None
        instance.predicted_view_confidence = confidence

        db.add(instance)
        result_map[instance.sop_instance_uid] = {
            "view": instance.predicted_view,
            "confidence": confidence,
            "file_path": file_path,
        }

    # Part 3.2 Commit once after batch updates
    db.commit()
    logger.info(
        f"[view_classifier] Saved views for {len(result_map)}/{len(instances)} instances in study {study_uid}"
    )

    # Part 3.3 Free up model memory (you requested unload at the end)
    _unload_model(ep)
    logger.info(f"[view_classifier] EchoPrime model is unloaded.")

    return result_map
    
