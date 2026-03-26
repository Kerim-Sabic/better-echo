from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.admin import router as admin_router
from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import verify_password


def _build_app(db_session_factory):
    app = FastAPI()
    app.include_router(admin_router, prefix="/api")

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return app


def test_bootstrap_admin_creates_first_admin(db_session_factory):
    app = _build_app(db_session_factory)
    client = TestClient(app, client=("127.0.0.1", 50000))

    response = client.post(
        "/api/admin/bootstrap-user",
        json={
            "username": "admin1",
            "password": "super-secret",
            "full_name": "Pilot Admin",
        },
    )

    assert response.status_code == 201
    response_body = response.json()
    assert response_body["message"] == "Bootstrap admin created successfully."
    assert response_body["user"]["username"] == "admin1"
    assert response_body["user"]["role"] == "admin"
    assert response_body["user"]["full_name"] == "Pilot Admin"
    assert isinstance(response_body["user"]["id"], int)
    assert response_body["user"]["id"] > 0

    db = db_session_factory()
    try:
        created_user = db.query(User).filter(User.username == "admin1").first()
        assert created_user is not None
        assert created_user.id == response_body["user"]["id"]
        assert created_user.role == "admin"
        assert created_user.hashed_password != "super-secret"
        assert verify_password("super-secret", created_user.hashed_password)
    finally:
        db.close()


def test_bootstrap_admin_is_rejected_after_first_user_exists(db_session_factory):
    db = db_session_factory()
    try:
        db.add(
            User(
                username="existing_admin",
                hashed_password="hashed",
                full_name="Existing Admin",
                role="admin",
            )
        )
        db.commit()
    finally:
        db.close()

    app = _build_app(db_session_factory)
    client = TestClient(app, client=("127.0.0.1", 50000))

    response = client.post(
        "/api/admin/bootstrap-user",
        json={
            "username": "admin2",
            "password": "another-secret",
            "full_name": "Second Admin",
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Bootstrap admin is only available before the first user is created."
    }


def test_bootstrap_admin_is_rejected_from_non_local_client(db_session_factory):
    app = _build_app(db_session_factory)
    client = TestClient(app, client=("192.168.10.25", 50000))

    response = client.post(
        "/api/admin/bootstrap-user",
        json={
            "username": "admin1",
            "password": "super-secret",
            "full_name": "Pilot Admin",
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "This server setup action is only available from the local server machine."
    }
