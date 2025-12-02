import logging
import os
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.api.inference.infer_echoprime_api import get_ep
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.core.artifacts import UPLOAD_DIR

logger = logging.getLogger(__name__)


def classify_views_for_study(study_uid: str, db: Session) -> Dict[str, Dict[str, Optional[float | str]]]:
    """
    Use the preloaded EchoPrime view classifier to tag all instances in a study.
    Persists predicted_view and predicted_view_confidence to Instance rows.
    Returns a mapping of SOPInstanceUID -> {view, confidence, file_path}.
    """
    study_folder = os.path.join(UPLOAD_DIR, study_uid)
    if not os.path.isdir(study_folder):
        raise FileNotFoundError(f"Study folder not found: {study_folder}")

    study: Optional[Study] = (
        db.query(Study).filter(Study.study_uid == study_uid).first()
    )
    if not study:
        raise ValueError(f"Study not found in DB: {study_uid}")

    instances = (
        db.query(Instance)
        .join(Instance.series)
        .join(Series.study)
        .filter(Study.id == study.id)
        .all()
    )

    # If all instances already have predicted views, return cached values
    if instances and all(inst.predicted_view for inst in instances):
        result_map: Dict[str, Dict[str, Optional[float | str]]] = {}
        for inst in instances:
            result_map[inst.sop_instance_uid] = {
                "view": inst.predicted_view,
                "confidence": inst.predicted_view_confidence,
                "file_path": inst.file_path,
            }
        logger.info(
            "[view_classifier] Using cached views for %d/%d instances in study %s",
            len(result_map),
            len(instances),
            study_uid,
        )
        return result_map

    instances_by_path: Dict[str, Instance] = {
        os.path.abspath(i.file_path): i for i in instances if i.file_path
    }

    disk_files = [
        os.path.abspath(os.path.join(study_folder, fname))
        for fname in sorted(os.listdir(study_folder))
        if os.path.isfile(os.path.join(study_folder, fname))
    ]
    if not disk_files:
        raise FileNotFoundError(f"No DICOM files found in {study_folder}")

    ep = get_ep()
    stack_of_videos = ep.process_dicoms(study_folder)
    view_list, view_confidence_list = ep.get_views(
        stack_of_videos,
        visualize=False,
        return_view_list=True,
        return_scores=True,
    )

    n_preds = len(view_list)
    if n_preds != len(disk_files):
        logger.warning(
            "[view_classifier] Mismatch for study %s: %d predictions vs %d files",
            study_uid,
            n_preds,
            len(disk_files),
        )

    limit = min(n_preds, len(disk_files))
    result_map: Dict[str, Dict[str, Optional[float | str]]] = {}
    for idx, file_path in enumerate(disk_files[:limit]):
        inst = instances_by_path.get(file_path)
        if not inst:
            continue
        label = view_list[idx]
        confidence = float(view_confidence_list[idx]) if idx < len(view_confidence_list) else None
        inst.predicted_view = str(label).upper() if label else None
        inst.predicted_view_confidence = confidence
        db.add(inst)
        result_map[inst.sop_instance_uid] = {
            "view": inst.predicted_view,
            "confidence": confidence,
            "file_path": file_path,
        }

    db.commit()
    logger.info(
        "[view_classifier] Saved views for %d/%d instances in study %s",
        len(result_map),
        len(instances),
        study_uid,
    )
    return result_map
