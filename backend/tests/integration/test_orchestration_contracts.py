from fastapi.testclient import TestClient

from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE
from app.database_models.derived_results import DerivedResult, ResultStatus


def test_panecho_echoprime_first_call_returns_pending_and_retry_after(app, db_session_factory, seeded_study):
    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-combined-results")

    assert response.status_code == 202
    assert response.headers.get("retry-after") == "3"
    body = response.json()
    assert body.get("status") == "pending"
    assert body.get("retry_after") == 3

    db = db_session_factory()
    try:
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == seeded_study["study_id"],
                DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
            )
            .first()
        )
        assert row is not None
        assert row.status == ResultStatus.pending
    finally:
        db.close()


def test_override_endpoint_returns_409_when_combined_not_ready(app, seeded_study):
    client = TestClient(app)
    response = client.patch(
        f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-overrides",
        json={"overrides": {"ejection_fraction": {"value": 60}}},
    )

    assert response.status_code == 409
    assert response.json().get("detail") == "Combined results are not ready"


def test_dynamic_measurements_returns_pending_when_prerequisite_missing(app, seeded_study):
    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/Dynamic-Measurements-combined-results")

    assert response.status_code == 202
    assert response.headers.get("retry-after") == "3"
    body = response.json()
    assert body.get("status") == "pending"
    assert body.get("retry_after") == 3


def test_llm_results_returns_404_when_llm_disabled(app, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "false")
    client = TestClient(app)

    response = client.get(f"/api/studies/{seeded_study['study_uid']}/llm-report-results")

    assert response.status_code == 404
    assert response.json().get("detail") == "LLM report disabled"
