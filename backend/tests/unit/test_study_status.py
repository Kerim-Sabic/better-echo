from types import SimpleNamespace

from app.core.artifacts import (
    MEASUREMENT_WORKFLOW_TYPE,
    REPORT_SUMMARY_TYPE,
    COMBINED_ANALYSIS_TYPE,
)
from app.database_models.derived_results import ResultStatus
from app.helpers.pipeline.study_status import compute_study_status, status_by_type


def test_compute_study_status_llm_disabled_completed():
    derived = {
        COMBINED_ANALYSIS_TYPE: ResultStatus.complete,
        MEASUREMENT_WORKFLOW_TYPE: ResultStatus.complete,
    }
    assert compute_study_status(False, derived) == "completed"


def test_compute_study_status_llm_disabled_failed():
    derived = {
        COMBINED_ANALYSIS_TYPE: ResultStatus.failed,
        MEASUREMENT_WORKFLOW_TYPE: ResultStatus.complete,
    }
    assert compute_study_status(False, derived) == "failed"


def test_compute_study_status_llm_disabled_processing_when_missing_required():
    derived = {
        COMBINED_ANALYSIS_TYPE: ResultStatus.complete,
    }
    assert compute_study_status(False, derived) == "processing"


def test_compute_study_status_llm_enabled_requires_llm_complete():
    derived = {
        COMBINED_ANALYSIS_TYPE: ResultStatus.complete,
        MEASUREMENT_WORKFLOW_TYPE: ResultStatus.complete,
        REPORT_SUMMARY_TYPE: ResultStatus.pending,
    }
    assert compute_study_status(True, derived) == "processing"


def test_compute_study_status_llm_enabled_completed():
    derived = {
        COMBINED_ANALYSIS_TYPE: ResultStatus.complete,
        MEASUREMENT_WORKFLOW_TYPE: ResultStatus.complete,
        REPORT_SUMMARY_TYPE: ResultStatus.complete,
    }
    assert compute_study_status(True, derived) == "completed"


def test_compute_study_status_llm_enabled_failed():
    derived = {
        COMBINED_ANALYSIS_TYPE: ResultStatus.complete,
        MEASUREMENT_WORKFLOW_TYPE: ResultStatus.complete,
        REPORT_SUMMARY_TYPE: ResultStatus.failed,
    }
    assert compute_study_status(True, derived) == "failed"


def test_status_by_type_collapses_multiple_rows_with_failed_precedence():
    rows = [
        SimpleNamespace(type=REPORT_SUMMARY_TYPE, status=ResultStatus.complete),
        SimpleNamespace(type=REPORT_SUMMARY_TYPE, status=ResultStatus.failed),
    ]
    statuses = status_by_type(rows)
    assert statuses[REPORT_SUMMARY_TYPE] == ResultStatus.failed


