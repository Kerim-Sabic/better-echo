from types import SimpleNamespace

from app.core.artifacts import (
    DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
    LLM_REPORT_TYPE,
    PANECHO_ECHOPRIME_COMBINED_TYPE,
)
from app.database_models.derived_results import ResultStatus
from app.helpers.pipeline.study_status import compute_study_status, status_by_type


def test_compute_study_status_llm_disabled_completed():
    derived = {
        PANECHO_ECHOPRIME_COMBINED_TYPE: ResultStatus.complete,
        DYNAMIC_MEASUREMENTS_COMBINED_TYPE: ResultStatus.complete,
    }
    assert compute_study_status(False, derived) == "completed"


def test_compute_study_status_llm_disabled_failed():
    derived = {
        PANECHO_ECHOPRIME_COMBINED_TYPE: ResultStatus.failed,
        DYNAMIC_MEASUREMENTS_COMBINED_TYPE: ResultStatus.complete,
    }
    assert compute_study_status(False, derived) == "failed"


def test_compute_study_status_llm_disabled_processing_when_missing_required():
    derived = {
        PANECHO_ECHOPRIME_COMBINED_TYPE: ResultStatus.complete,
    }
    assert compute_study_status(False, derived) == "processing"


def test_compute_study_status_llm_enabled_requires_llm_complete():
    derived = {
        PANECHO_ECHOPRIME_COMBINED_TYPE: ResultStatus.complete,
        DYNAMIC_MEASUREMENTS_COMBINED_TYPE: ResultStatus.complete,
        LLM_REPORT_TYPE: ResultStatus.pending,
    }
    assert compute_study_status(True, derived) == "processing"


def test_compute_study_status_llm_enabled_completed():
    derived = {
        PANECHO_ECHOPRIME_COMBINED_TYPE: ResultStatus.complete,
        DYNAMIC_MEASUREMENTS_COMBINED_TYPE: ResultStatus.complete,
        LLM_REPORT_TYPE: ResultStatus.complete,
    }
    assert compute_study_status(True, derived) == "completed"


def test_compute_study_status_llm_enabled_failed():
    derived = {
        PANECHO_ECHOPRIME_COMBINED_TYPE: ResultStatus.complete,
        DYNAMIC_MEASUREMENTS_COMBINED_TYPE: ResultStatus.complete,
        LLM_REPORT_TYPE: ResultStatus.failed,
    }
    assert compute_study_status(True, derived) == "failed"


def test_status_by_type_collapses_multiple_rows_with_failed_precedence():
    rows = [
        SimpleNamespace(type=LLM_REPORT_TYPE, status=ResultStatus.complete),
        SimpleNamespace(type=LLM_REPORT_TYPE, status=ResultStatus.failed),
    ]
    statuses = status_by_type(rows)
    assert statuses[LLM_REPORT_TYPE] == ResultStatus.failed

