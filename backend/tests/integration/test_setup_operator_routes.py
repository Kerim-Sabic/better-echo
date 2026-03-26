from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.admin import router as admin_router
from app.api.licensing import router as licensing_router
from app.database.db import get_db


def _build_app(db_session_factory):
    app = FastAPI()
    app.include_router(admin_router, prefix="/api")
    app.include_router(licensing_router, prefix="/api")

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return app


def test_setup_status_and_license_status_are_available_locally_without_auth(db_session_factory):
    app = _build_app(db_session_factory)
    client = TestClient(app, client=("127.0.0.1", 50000))

    setup_response = client.get("/api/admin/setup-status")
    license_response = client.get("/api/licensing/status")

    assert setup_response.status_code == 200
    assert setup_response.json() == {
        "bootstrap_required": True,
        "total_users": 0,
        "admin_count": 0,
        "max_users": 6,
    }
    assert license_response.status_code == 200
    assert license_response.json()["status"] in {"missing", "invalid", "expired", "valid"}


def test_setup_status_and_license_status_are_blocked_for_non_local_clients(db_session_factory):
    app = _build_app(db_session_factory)
    client = TestClient(app, client=("192.168.10.25", 50000))

    setup_response = client.get("/api/admin/setup-status")
    license_response = client.get("/api/licensing/status")

    assert setup_response.status_code == 403
    assert license_response.status_code == 403
