from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

from sqlalchemy.orm.attributes import flag_modified

from app.core.runtime_paths import cache_dir, uploads_dir
from app.database.db import SessionLocal
from app.database_models.derived_results import DerivedResult


logger = logging.getLogger(__name__)

_MIGRATION_VERSION = "release-identifiers-v1"
_MARKER_FILE = cache_dir("release") / f"{_MIGRATION_VERSION}.done"

RESULT_TYPE_MAP = {
    "PanEcho_AllTasks": "StudyAnalysisPrimary_Tasks",
    "EchoPrime_AllTasks": "StudyAnalysisSecondary_Tasks",
    "PanEcho_EchoPrime_Combined_Tasks": "StudyAnalysis_Combined_Tasks",
    "Dynamic_Measurements_Combined_Tasks": "StudyMeasurements_Combined_Tasks",
    "LLM_Echo_Report": "Study_Report",
    "EchonetDynamic_LV_Segmentation": "MotionSegmentation_LV",
}

MODEL_NAME_MAP = {
    "PanEcho": "StudyAnalysisPrimary",
    "EchoPrime": "StudyAnalysisSecondary",
    "PanEcho_EchoPrime_Combined": "StudyAnalysisCombined",
    "Dynamic_Measurements_Combined": "StudyMeasurementsWorkflow",
    "LLM_Report_Generator": "StudyReportGenerator",
    "EchonetDynamic": "MotionSegmentation",
}

JSON_KEY_MAP = {
    "panecho_value_or_prob": "primary_value_or_prob",
    "echoprime_value_or_prob": "secondary_value_or_prob",
}

STRING_VALUE_REPLACEMENTS = {
    "echonet_dynamic_LV-segmentation_files": "motion_segmentation_files",
    "measurements_2D_keypoint_detection": "linear_measurements_files",
    "measurements_doppler": "spectral_measurements_files",
    "llm_reports": "study_reports",
    "echonet_dynamic_lv_segmentation": "motion_segmentation_lv",
    "measurements_2d": "measurement_linear",
    "measurements_doppler": "measurement_spectral",
    "PanEcho_EchoPrime_Combined": "StudyAnalysisCombined",
    "Dynamic_Measurements_Combined": "StudyMeasurementsWorkflow",
    "LLM_Report_Generator": "StudyReportGenerator",
}

LEGACY_UPLOAD_DIRS = {
    "echonet_dynamic_LV-segmentation_files": "motion_segmentation_files",
    "measurements_2D_keypoint_detection": "linear_measurements_files",
    "measurements_doppler": "spectral_measurements_files",
    "llm_reports": "study_reports",
}


def canonical_result_type(value: str | None) -> str | None:
    if not value:
        return value
    if value in RESULT_TYPE_MAP:
        return RESULT_TYPE_MAP[value]
    if value.startswith("EchoNetMeasurements2D_"):
        return value.replace("EchoNetMeasurements2D_", "LinearMeasurements_", 1)
    if value.startswith("EchoNetMeasurementsDoppler_"):
        return value.replace("EchoNetMeasurementsDoppler_", "SpectralMeasurements_", 1)
    return value


def canonical_model_name(value: str | None) -> str | None:
    if not value:
        return value
    return MODEL_NAME_MAP.get(value, value)


def canonical_json(value: Any) -> Any:
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, inner in value.items():
            mapped_key = JSON_KEY_MAP.get(str(key), str(key))
            normalized[mapped_key] = canonical_json(inner)
        return normalized

    if isinstance(value, list):
        return [canonical_json(item) for item in value]

    if isinstance(value, str):
        normalized = value
        for legacy, replacement in STRING_VALUE_REPLACEMENTS.items():
            normalized = normalized.replace(legacy, replacement)
        return normalized

    return value


def _merge_directory_contents(source: Path, target: Path) -> tuple[int, int]:
    moved = 0
    conflicts = 0
    if not source.exists():
        return moved, conflicts

    target.mkdir(parents=True, exist_ok=True)
    for item in source.iterdir():
        destination = target / item.name
        if item.is_dir():
            child_moved, child_conflicts = _merge_directory_contents(item, destination)
            moved += child_moved
            conflicts += child_conflicts
            try:
                item.rmdir()
            except OSError:
                pass
            continue

        if destination.exists():
            try:
                if item.read_bytes() == destination.read_bytes():
                    item.unlink()
                    moved += 1
                else:
                    conflicts += 1
            except OSError:
                conflicts += 1
            continue

        shutil.move(str(item), str(destination))
        moved += 1

    try:
        source.rmdir()
    except OSError:
        pass
    return moved, conflicts


def migrate_upload_dirs(uploads_root: Path) -> dict[str, int]:
    moved = 0
    conflicts = 0
    checked = 0

    for legacy_name, neutral_name in LEGACY_UPLOAD_DIRS.items():
        checked += 1
        legacy_dir = uploads_root / legacy_name
        neutral_dir = uploads_root / neutral_name
        if not legacy_dir.exists():
            continue
        child_moved, child_conflicts = _merge_directory_contents(legacy_dir, neutral_dir)
        moved += child_moved
        conflicts += child_conflicts

    return {
        "directories_checked": checked,
        "files_moved": moved,
        "conflicts": conflicts,
    }


def migrate_database() -> dict[str, int]:
    session = SessionLocal()
    updated_rows = 0
    updated_json_rows = 0
    try:
        rows = session.query(DerivedResult).all()
        for row in rows:
            changed = False

            normalized_type = canonical_result_type(row.type)
            if normalized_type != row.type:
                row.type = normalized_type
                changed = True

            normalized_name = canonical_model_name(row.model_name)
            if normalized_name != row.model_name:
                row.model_name = normalized_name
                changed = True

            normalized_json = canonical_json(row.value_json)
            if normalized_json != row.value_json:
                row.value_json = normalized_json
                flag_modified(row, "value_json")
                updated_json_rows += 1
                changed = True

            if changed:
                updated_rows += 1

        if updated_rows:
            session.commit()
        else:
            session.rollback()
    finally:
        session.close()

    return {
        "rows_updated": updated_rows,
        "json_rows_updated": updated_json_rows,
    }


def run_release_identifier_migration(*, force: bool = False) -> dict[str, Any]:
    marker_preexisted = _MARKER_FILE.exists()

    database_summary = migrate_database()
    upload_summary = migrate_upload_dirs(Path(uploads_dir()))
    summary = {
        "skipped": False,
        "forced": force,
        "marker_preexisted": marker_preexisted,
        "database": database_summary,
        "uploads": upload_summary,
    }

    _MARKER_FILE.parent.mkdir(parents=True, exist_ok=True)
    _MARKER_FILE.write_text(
        (
            f"rows_updated={database_summary['rows_updated']}\n"
            f"json_rows_updated={database_summary['json_rows_updated']}\n"
            f"directories_checked={upload_summary['directories_checked']}\n"
            f"files_moved={upload_summary['files_moved']}\n"
            f"conflicts={upload_summary['conflicts']}\n"
        ),
        encoding="utf-8",
    )
    logger.info(
        "[ReleaseMigration] completed | rows_updated=%s json_rows_updated=%s files_moved=%s conflicts=%s",
        database_summary["rows_updated"],
        database_summary["json_rows_updated"],
        upload_summary["files_moved"],
        upload_summary["conflicts"],
    )
    return summary


__all__ = [
    "canonical_json",
    "canonical_model_name",
    "canonical_result_type",
    "migrate_database",
    "migrate_upload_dirs",
    "run_release_identifier_migration",
]
