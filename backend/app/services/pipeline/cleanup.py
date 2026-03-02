from __future__ import annotations

import os
from shutil import rmtree
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.core.artifacts import UPLOAD_DIR
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.services.integrations.orthanc_client import (
    delete_instance_from_orthanc,
    delete_study_from_orthanc,
)


def _new_cleanup_summary() -> Dict[str, Any]:
    return {
        "study_deleted": False,
        "orthanc_study_deleted": False,
        "orthanc_instances_deleted": 0,
        "instances_deleted": 0,
        "series_deleted": 0,
        "files_deleted": 0,
        "folders_deleted": 0,
        "folders_missing": 0,
        "errors": [],
    }


def _remove_file_if_exists(path: str, summary: Dict[str, Any]) -> None:
    if not path:
        return
    try:
        if os.path.exists(path):
            os.remove(path)
            summary["files_deleted"] += 1
    except Exception as err:
        summary["errors"].append(f"file_delete_failed:{path}:{err}")


def _remove_folder_if_exists(path: str, summary: Dict[str, Any]) -> None:
    try:
        if os.path.exists(path):
            rmtree(path)
            summary["folders_deleted"] += 1
        else:
            summary["folders_missing"] += 1
    except Exception as err:
        summary["errors"].append(f"folder_delete_failed:{path}:{err}")


def _study_folder_paths(study_uid: str) -> List[str]:
    return [
        os.path.join(UPLOAD_DIR, study_uid),
        os.path.join(UPLOAD_DIR, "echonet_dynamic_LV-segmentation_files", study_uid),
        os.path.join(UPLOAD_DIR, "measurements_2D_keypoint_detection", study_uid),
        os.path.join(UPLOAD_DIR, "measurements_doppler", study_uid),
        os.path.join(UPLOAD_DIR, "llm_reports", study_uid),
    ]


def _instance_folder_paths(study_uid: str, sop_instance_uid: str) -> List[str]:
    return [
        os.path.join(UPLOAD_DIR, "echonet_dynamic_LV-segmentation_files", study_uid, sop_instance_uid),
        os.path.join(UPLOAD_DIR, "measurements_2D_keypoint_detection", study_uid, sop_instance_uid),
        os.path.join(UPLOAD_DIR, "measurements_doppler", study_uid, sop_instance_uid),
    ]


def cleanup_new_study_scope(db: Session, *, study: Study) -> Dict[str, Any]:
    """
    Cancel cleanup for a study created in current upload flow.
    """
    summary = _new_cleanup_summary()

    # Part 1. Delete Orthanc study first.
    if study.study_orthanc_id:
        summary["orthanc_study_deleted"] = delete_study_from_orthanc(study.study_orthanc_id)

    # Part 2. Remove known local study-level folders.
    for folder in _study_folder_paths(study.study_uid):
        _remove_folder_if_exists(folder, summary)

    # Part 3. Delete DB study row (cascade removes related entities).
    db.delete(study)
    summary["study_deleted"] = True
    return summary


def cleanup_append_delta_scope(
    db: Session,
    *,
    study: Study,
    uploaded_instance_uids: List[str],
) -> Dict[str, Any]:
    """
    Cancel cleanup for append flow: delete only uploaded delta instances.
    """
    summary = _new_cleanup_summary()
    if not uploaded_instance_uids:
        return summary

    # Part 1. Resolve only delta instances tied to this study.
    instances = (
        db.query(Instance)
        .join(Series, Instance.series_id == Series.id)
        .filter(
            Series.study_id == study.id,
            Instance.sop_instance_uid.in_(uploaded_instance_uids),
        )
        .all()
    )

    # Part 2. Delete Orthanc instance + local artifacts + DB row.
    for instance in instances:
        if instance.instance_orthanc_id and delete_instance_from_orthanc(instance.instance_orthanc_id):
            summary["orthanc_instances_deleted"] += 1

        _remove_file_if_exists(instance.file_path, summary)

        for folder in _instance_folder_paths(study.study_uid, instance.sop_instance_uid):
            _remove_folder_if_exists(folder, summary)

        db.delete(instance)
        summary["instances_deleted"] += 1

    # Part 3. Remove empty series left after instance deletion.
    study_series = db.query(Series).filter(Series.study_id == study.id).all()
    for series in study_series:
        remaining = db.query(Instance).filter(Instance.series_id == series.id).count()
        if remaining == 0:
            db.delete(series)
            summary["series_deleted"] += 1

    return summary


__all__ = [
    "cleanup_new_study_scope",
    "cleanup_append_delta_scope",
]
