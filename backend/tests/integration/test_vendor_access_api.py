import io
import json
import zipfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.authentication import router as authentication_router
from app.api.results.combined_study_analysis_api import router as study_analysis_router
from app.api.studies.retrieve_study_api import router as retrieve_study_router
from app.core.artifacts import ANALYSIS_OVERRIDES_ROUTE_SEGMENT
from app.core.config import settings
from app.database.db import get_db
from app.database_models.instances import Instance
from app.database_models.patients import Patient
from app.database_models.series import Series
from app.database_models.studies import Study
from app.database_models.users import User
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.helpers.auth.authentication_functions import hash_password
from app.vendor_access import service as vendor_access_service
from app.vendor_access.router import router as vendor_access_router


def _build_app(db_session_factory):
    app = FastAPI()
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
        db.refresh(user)
        db.refresh(study)
        return user.id, study.study_uid
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


def test_vendor_access_login_and_read_only_access(db_session_factory, monkeypatch):
    _, study_uid = _seed_user_and_study(db_session_factory)
    _enable_vendor_access(monkeypatch)
    client = TestClient(_build_app(db_session_factory), client=("127.0.0.1", 50000))

    login_response = client.post(
        "/api/login",
        json={"username": "vendor_shadow", "password": "vendor-secret"},
    )

    assert login_response.status_code == 200
    assert login_response.json()["user"]["principal_type"] == "vendor"
    assert login_response.json()["user"]["id"] is None

    check_auth_response = client.get("/api/check-auth")
    assert check_auth_response.status_code == 200
    assert check_auth_response.json()["user"]["principal_type"] == "vendor"

    studies_response = client.get("/api/vendor-access/studies")
    assert studies_response.status_code == 200
    assert studies_response.json()["total_items"] == 1
    assert studies_response.json()["items"][0]["study_uid"] == study_uid

    study_response = client.get(f"/api/studies/{study_uid}")
    assert study_response.status_code == 200
    assert study_response.json()["study_uid"] == study_uid

    patch_response = client.patch(
        f"/api/studies/{study_uid}/{ANALYSIS_OVERRIDES_ROUTE_SEGMENT}",
        json={"overrides": {"lvef": {"value": 55}}},
    )
    assert patch_response.status_code == 403


def test_vendor_access_export_and_log_download(
    db_session_factory,
    monkeypatch,
    tmp_path,
):
    _, study_uid = _seed_user_and_study(db_session_factory)
    _enable_vendor_access(monkeypatch)
    log_dir = tmp_path / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    (log_dir / "horalix.log").write_text("line-1\nline-2\nline-3\n", encoding="utf-8")
    monkeypatch.setattr(vendor_access_service, "logs_dir", lambda: log_dir)
    client = TestClient(_build_app(db_session_factory), client=("127.0.0.1", 50000))

    login_response = client.post(
        "/api/login",
        json={"username": "vendor_shadow", "password": "vendor-secret"},
    )
    assert login_response.status_code == 200

    export_response = client.get("/api/vendor-access/exports/studies")
    assert export_response.status_code == 200
    assert export_response.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(export_response.content)) as archive:
        names = set(archive.namelist())
        assert f"doctor1/studies/{study_uid}/study-metadata.json" in names
        assert any(name.startswith(f"doctor1/studies/{study_uid}/dicoms/") for name in names)
        assert any(
            name.startswith(f"doctor1/studies/{study_uid}/derived_results/")
            for name in names
        )
        metadata = json.loads(
            archive.read(f"doctor1/studies/{study_uid}/study-metadata.json").decode("utf-8")
        )
        assert metadata["study"]["study_uid"] == study_uid

    logs_response = client.get("/api/vendor-access/logs/download")
    assert logs_response.status_code == 200
    assert logs_response.content.decode("utf-8").replace("\r\n", "\n") == "line-1\nline-2\nline-3\n"


def test_vendor_access_can_manage_users_and_delete_last_admin(
    db_session_factory,
    monkeypatch,
):
    _seed_user_and_study(db_session_factory)
    _enable_vendor_access(monkeypatch)
    db = db_session_factory()
    try:
        lone_admin = User(
            username="admin-only",
            hashed_password=hash_password("admin-secret"),
            full_name="Only Admin",
            role="admin",
        )
        db.add(lone_admin)
        db.commit()
        db.refresh(lone_admin)
        lone_admin_id = lone_admin.id
    finally:
        db.close()

    client = TestClient(_build_app(db_session_factory), client=("127.0.0.1", 50000))
    login_response = client.post(
        "/api/login",
        json={"username": "vendor_shadow", "password": "vendor-secret"},
    )
    assert login_response.status_code == 200

    create_response = client.post(
        "/api/vendor-access/users",
        json={
            "username": "newdoctor",
            "password": "new-secret",
            "full_name": "New Doctor",
            "role": "doctor",
        },
    )
    assert create_response.status_code == 200
    created_user_id = create_response.json()["user"]["id"]

    update_response = client.put(
        f"/api/vendor-access/users/{created_user_id}",
        json={
            "username": "newdoctor",
            "full_name": "New Doctor Updated",
            "role": "admin",
            "password": "reset-secret",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["user"]["role"] == "admin"

    delete_response = client.delete(f"/api/vendor-access/users/{lone_admin_id}")
    assert delete_response.status_code == 200

    user_activity_response = client.get("/api/vendor-access/users/activity")
    assert user_activity_response.status_code == 200
    usernames = {row["username"] for row in user_activity_response.json()["users"]}
    assert "admin-only" not in usernames


def test_vendor_access_is_hidden_from_normal_users(db_session_factory, monkeypatch):
    _seed_user_and_study(db_session_factory)
    _enable_vendor_access(monkeypatch)
    client = TestClient(_build_app(db_session_factory), client=("127.0.0.1", 50000))

    login_response = client.post(
        "/api/login",
        json={"username": "doctor1", "password": "doctor-secret"},
    )
    assert login_response.status_code == 200
    assert login_response.json()["user"]["principal_type"] == "user"

    vendor_response = client.get("/api/vendor-access/studies")
    assert vendor_response.status_code == 404


def test_vendor_access_login_is_disabled_outside_packaged_release(
    db_session_factory,
    monkeypatch,
):
    _seed_user_and_study(db_session_factory)
    monkeypatch.delenv("HORALIX_RELEASE_MODE", raising=False)
    monkeypatch.setattr(settings, "VENDOR_ACCESS_ENABLED", True)
    monkeypatch.setattr(settings, "VENDOR_ACCESS_USERNAME", "vendor_shadow")
    monkeypatch.setattr(settings, "VENDOR_ACCESS_DISPLAY_NAME", "Vendor Shadow")
    monkeypatch.setattr(
        settings,
        "VENDOR_ACCESS_PASSWORD_HASH",
        hash_password("vendor-secret"),
    )
    client = TestClient(_build_app(db_session_factory), client=("127.0.0.1", 50000))

    login_response = client.post(
        "/api/login",
        json={"username": "vendor_shadow", "password": "vendor-secret"},
    )

    assert login_response.status_code == 401
    assert login_response.json() == {"detail": "Invalid credentials"}
