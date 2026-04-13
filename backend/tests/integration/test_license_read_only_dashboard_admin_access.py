from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.admin import router as admin_router
from app.api.licensing import router as licensing_router
from app.api.pipeline.pipeline_start_api import router as pipeline_start_router
from app.api.studies import router as studies_router
from app.core.config import settings
from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import get_current_user_id
from app.services.auth.principal_service import (
    get_current_auth_principal,
    get_current_doctor_user_id,
    get_current_study_read_principal,
)
from app.services.licensing import middleware as licensing_middleware
from app.services.licensing.middleware import enforce_license_middleware
from app.api.licensing import licensing_api


def _build_license_enforced_doctor_app(db_session_factory, seeded_study):
    app = FastAPI()
    app.middleware("http")(enforce_license_middleware)
    app.include_router(studies_router, prefix="/api")
    app.include_router(pipeline_start_router, prefix="/api")

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    doctor_principal = {
        "id": seeded_study["user_id"],
        "username": "test-doctor",
        "role": "doctor",
        "full_name": "Test Doctor",
        "principal_type": "user",
    }

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_doctor_user_id] = lambda: seeded_study["user_id"]
    app.dependency_overrides[get_current_auth_principal] = lambda: doctor_principal
    app.dependency_overrides[get_current_study_read_principal] = lambda: doctor_principal
    return app


def _seed_admin_and_doctor(db_session_factory):
    db = db_session_factory()
    try:
        admin = User(
            username="admin1",
            hashed_password="hashed",
            full_name="Admin One",
            role="admin",
        )
        doctor = User(
            username="doctor1",
            hashed_password="hashed",
            full_name="Doctor One",
            role="doctor",
        )
        db.add_all([admin, doctor])
        db.commit()
        db.refresh(admin)
        return admin.id
    finally:
        db.close()


def _build_license_enforced_admin_app(db_session_factory, admin_user_id):
    app = FastAPI()
    app.middleware("http")(enforce_license_middleware)
    app.include_router(admin_router, prefix="/api")
    app.include_router(licensing_router, prefix="/api")

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = lambda: admin_user_id
    return app


def test_expired_license_allows_doctor_dashboard_reads_but_blocks_pipeline_start(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setattr(settings, "LICENSE_ENFORCEMENT", True, raising=False)
    monkeypatch.setattr(
        licensing_middleware,
        "get_license_status",
        lambda: {
            "status": "expired",
            "valid": False,
            "detail": "License has expired.",
        },
    )

    app = _build_license_enforced_doctor_app(db_session_factory, seeded_study)
    client = TestClient(app, client=("127.0.0.1", 50000))

    studies_response = client.get("/api/studies")
    study_response = client.get(f"/api/studies/{seeded_study['study_uid']}")
    instances_response = client.get(f"/api/studies/{seeded_study['study_uid']}/instances")
    pipeline_response = client.post(
        f"/api/studies/{seeded_study['study_uid']}/pipeline/start",
        json={},
    )

    assert studies_response.status_code == 200
    assert len(studies_response.json()) == 1
    assert study_response.status_code == 200
    assert study_response.json()["study_uid"] == seeded_study["study_uid"]
    assert instances_response.status_code == 200
    assert pipeline_response.status_code == 403
    assert pipeline_response.json()["detail"] == "Server license is invalid or missing."


def test_expired_license_allows_admin_user_list_and_licensing_routes_but_blocks_mutations(
    db_session_factory,
    monkeypatch,
):
    admin_user_id = _seed_admin_and_doctor(db_session_factory)
    monkeypatch.setattr(settings, "LICENSE_ENFORCEMENT", True, raising=False)
    monkeypatch.setattr(
        licensing_middleware,
        "get_license_status",
        lambda: {
            "status": "expired",
            "valid": False,
            "detail": "License has expired.",
        },
    )
    monkeypatch.setattr(
        licensing_api,
        "import_signed_license",
        lambda _payload: {
            "status": "valid",
            "valid": True,
            "detail": None,
            "license_id": "pilot-renewed",
            "customer_name": "Test Hospital",
            "expires_at": "2026-12-31T00:00:00Z",
            "features": ["core"],
        },
    )

    app = _build_license_enforced_admin_app(db_session_factory, admin_user_id)
    client = TestClient(app, client=("127.0.0.1", 50000))

    list_response = client.get("/api/admin/users")
    create_response = client.post(
        "/api/admin/users",
        json={
            "username": "doctor2",
            "password": "secret-2",
            "full_name": "Doctor Two",
            "role": "doctor",
        },
    )
    update_response = client.put(
        f"/api/admin/users/{admin_user_id}",
        json={
            "username": "admin1-updated",
            "full_name": "Admin Updated",
            "role": "admin",
            "password": "new-secret",
        },
    )
    delete_response = client.delete(f"/api/admin/users/{admin_user_id}")
    activation_request_response = client.get("/api/licensing/activation-request")
    import_response = client.post(
        "/api/licensing/import",
        json={"license": {"license_id": "pilot"}, "signature": "signature"},
    )

    assert list_response.status_code == 200
    assert list_response.json()["total_users"] == 2
    assert create_response.status_code == 403
    assert update_response.status_code == 403
    assert delete_response.status_code == 403
    assert activation_request_response.status_code == 200
    assert import_response.status_code == 200
    assert import_response.json()["status"] == "valid"
