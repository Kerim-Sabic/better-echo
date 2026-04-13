from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.results.combined_dynamic_measurements_api import router as dynamic_router
from app.api.results.combined_study_analysis_api import router as study_analysis_router
from app.api.results.llm_report_get_api import router as llm_results_router
from app.core.config import settings
from app.database.db import get_db
from app.helpers.auth.authentication_functions import get_current_user_id
from app.services.auth.principal_service import (
    get_current_auth_principal,
    get_current_doctor_user_id,
    get_current_study_read_principal,
)
from app.services.licensing import middleware as licensing_middleware
from app.services.licensing.middleware import enforce_license_middleware


def _build_license_enforced_results_app(db_session_factory, seeded_study):
    app = FastAPI()
    app.middleware("http")(enforce_license_middleware)
    app.include_router(study_analysis_router, prefix="/api")
    app.include_router(dynamic_router, prefix="/api")
    app.include_router(llm_results_router, prefix="/api")

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = lambda: seeded_study["user_id"]
    app.dependency_overrides[get_current_doctor_user_id] = lambda: seeded_study["user_id"]
    app.dependency_overrides[get_current_auth_principal] = lambda: {
        "id": seeded_study["user_id"],
        "username": "test-doctor",
        "role": "doctor",
        "full_name": "Test Doctor",
        "principal_type": "user",
    }
    app.dependency_overrides[get_current_study_read_principal] = lambda: {
        "id": seeded_study["user_id"],
        "username": "test-doctor",
        "role": "doctor",
        "full_name": "Test Doctor",
        "principal_type": "user",
    }
    return app


def test_expired_license_allows_observer_results_reads_but_blocks_writes(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setattr(settings, "LICENSE_ENFORCEMENT", True, raising=False)
    monkeypatch.setenv("ENABLE_LLM", "true")
    monkeypatch.setattr(
        licensing_middleware,
        "get_license_status",
        lambda: {
            "status": "expired",
            "valid": False,
            "detail": "License has expired.",
        },
    )

    app = _build_license_enforced_results_app(db_session_factory, seeded_study)
    client = TestClient(app)

    study_analysis_response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/study-analysis-results"
    )
    dynamic_response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/study-measurements-results"
    )
    llm_response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/llm-report-results"
    )
    override_response = client.patch(
        f"/api/studies/{seeded_study['study_uid']}/study-analysis-overrides",
        json={"overrides": {"ejection_fraction": {"value": 60}}},
    )

    assert study_analysis_response.status_code == 202
    assert dynamic_response.status_code == 202
    assert llm_response.status_code == 202
    assert override_response.status_code == 403
    assert override_response.json()["detail"] == "Server license is invalid or missing."
