import os
from typing import Iterable, Dict, Optional

from app.core.artifacts import (
    COMBINED_ANALYSIS_TYPE,
    MEASUREMENT_WORKFLOW_TYPE,
    REPORT_SUMMARY_TYPE,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.studies import Study


def is_llm_enabled() -> bool:
    return os.getenv("ENABLE_LLM", "true").lower() == "true"


def required_artifact_types(enable_llm: bool) -> list[str]:
    required = [
        COMBINED_ANALYSIS_TYPE,
        MEASUREMENT_WORKFLOW_TYPE,
    ]
    if enable_llm:
        required.append(REPORT_SUMMARY_TYPE)
    return required


def _normalize_status(value: object) -> Optional[ResultStatus]:
    if isinstance(value, ResultStatus):
        return value
    if isinstance(value, str):
        try:
            return ResultStatus(value)
        except Exception:
            return None
    return None


def status_by_type(rows: Iterable[DerivedResult]) -> Dict[str, Optional[ResultStatus]]:
    grouped: Dict[str, list[Optional[ResultStatus]]] = {}
    for row in rows:
        grouped.setdefault(row.type, []).append(_normalize_status(row.status))

    collapsed: Dict[str, Optional[ResultStatus]] = {}
    for key, statuses in grouped.items():
        if any(status == ResultStatus.failed for status in statuses):
            collapsed[key] = ResultStatus.failed
        elif any(status == ResultStatus.pending for status in statuses):
            collapsed[key] = ResultStatus.pending
        elif any(status == ResultStatus.complete for status in statuses):
            collapsed[key] = ResultStatus.complete
        else:
            collapsed[key] = None
    return collapsed


def compute_study_status(enable_llm: bool, derived_statuses: Dict[str, Optional[ResultStatus]]) -> str:
    required = required_artifact_types(enable_llm)
    required_statuses = [derived_statuses.get(artifact_type) for artifact_type in required]

    if any(status == ResultStatus.failed for status in required_statuses):
        return "failed"

    if all(status == ResultStatus.complete for status in required_statuses):
        return "completed"

    return "processing"


def sync_study_status(study: Study, *, enable_llm: Optional[bool] = None) -> tuple[str, bool]:
    llm_enabled = is_llm_enabled() if enable_llm is None else enable_llm
    derived_statuses = status_by_type(study.derived_results or [])
    next_status = compute_study_status(llm_enabled, derived_statuses)
    changed = study.status != next_status
    if changed:
        study.status = next_status
    return next_status, changed
