import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.authentication import router as authentication_router
from app.api.results.combined_study_analysis_api import router as study_analysis_router
from app.api.studies.retrieve_study_api import router as retrieve_study_router
from app.core.artifacts import ANALYSIS_OVERRIDES_ROUTE_SEGMENT
from app.core.config import settings
from app.database.db import get_db
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.database_models.patients import Patient
from app.database_models.series import Series
from app.database_models.studies import Study
from app.database_models.users import User
from app.helpers.auth.authentication_functions import hash_password
from app.services.licensing import middleware as licensing_middleware
from app.services.licensing.middleware import enforce_license_middleware
from app.vendor_access.router import router as vendor_access_router


def _build_license_enforced_vendor_app(db_session_factory):
    app = FastAPI()
    app.middleware("http")(enforce_license_middleware)
    app.include_router(authentication_router, prefix="/api")
    app.include_router(vendor_access_router, prefix="/api")
    app.include_router(retrieve_study_router, prefix="/api")
    app.include_router(study_analysis_router, prefix="/api")

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return app


def _seed_user_and_study(db_session_factory):
    db = db_session_factory()
    try:
        user = User(
            username="doctor1",
            hashed_password=hash_password("doctor-secret"),
            full_name="Doctor One",
            role="doctor",
        )
        patient = Patient(
            patient_id="patient-1",
            patient_name="Test Patient",
            patient_sex="M",
            patient_birth_date="19800101",
            patient_orthanc_id="patient-orthanc-1",
        )
        study = Study(
            study_uid="study-uid-1",
            study_date="20260101",
            description="Test Study",
            study_orthanc_id="study-orthanc-1",
            status="processing",
            user=user,
            patient=patient,
        )
        series = Series(
            series_uid="series-uid-1",
            modality="US",
            description="Echo Series",
            series_orthanc_id="series-orthanc-1",
            study=study,
        )
        instance = Instance(
            sop_instance_uid="instance-uid-1",
            file_path=__file__,
            instance_orthanc_id="instance-orthanc-1",
            instance_number="1",
            series=series,
        )
        derived_result = DerivedResult(
            type="StudyAnalysis_Combined",
            status=ResultStatus.complete,
            value_json={"integrated_tasks": {"lvef": {"value": 55}}},
            model_name="study_analysis",
            model_version="1.0.0",
            study=study,
            instance=instance,
        )
        db.add_all([user, patient, study, series, instance, derived_result])
        db.commit()
        db.refresh(study)
        return study.study_uid
    finally:
        db.close()


def _enable_vendor_access(monkeypatch):
    monkeypatch.setenv("HORALIX_RELEASE_MODE", "1")
    monkeypatch.setattr(settings, "VENDOR_ACCESS_ENABLED", True)
    monkeypatch.setattr(settings, "VENDOR_ACCESS_USERNAME", "vendor_shadow")
    monkeypatch.setattr(settings, "VENDOR_ACCESS_DISPLAY_NAME", "Vendor Shadow")
    monkeypatch.setattr(
        settings,
        "VENDOR_ACCESS_PASSWORD_HASH",
        hash_password("vendor-secret"),
    )


@pytest.mark.parametrize(
    "license_status",
    [
        {
            "status": "missing",
            "valid": False,
            "detail": "No signed license has been imported.",
        },
        {
            "status": "expired",
            "valid": False,
            "detail": "License has expired.",
        },
        {
            "status": "invalid",
            "valid": False,
            "detail": "License signature verification failed.",
        },
    ],
)
def test_vendor_access_bypasses_license_enforcement(
    db_session_factory,
    monkeypatch,
    license_status,
):
    study_uid = _seed_user_and_study(db_session_factory)
    _enable_vendor_access(monkeypatch)
    monkeypatch.setattr(settings, "LICENSE_ENFORCEMENT", True, raising=False)
    monkeypatch.setattr(
        licensing_middleware,
        "get_license_status",
        lambda: dict(license_status),
    )

    client = TestClient(
        _build_license_enforced_vendor_app(db_session_factory),
        client=("127.0.0.1", 50000),
    )

    login_response = client.post(
        "/api/login",
        json={"username": "vendor_shadow", "password": "vendor-secret"},
    )
    studies_response = client.get("/api/vendor-access/studies")
    study_response = client.get(f"/api/studies/{study_uid}")
    patch_response = client.patch(
        f"/api/studies/{study_uid}/{ANALYSIS_OVERRIDES_ROUTE_SEGMENT}",
        json={"overrides": {"lvef": {"value": 55}}},
    )

    assert login_response.status_code == 200
    assert login_response.json()["user"]["principal_type"] == "vendor"
    assert studies_response.status_code == 200
    assert studies_response.json()["items"][0]["study_uid"] == study_uid
    assert study_response.status_code == 200
    assert study_response.json()["study_uid"] == study_uid
    assert patch_response.status_code == 403
