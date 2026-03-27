from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.admin import router as admin_router
from app.api.authentication import router as authentication_router
from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import hash_password


DESKTOP_HEADERS = {"X-Horalix-Desktop-Client": "1"}


def _build_app(db_session_factory):
    app = FastAPI()
    app.include_router(authentication_router, prefix="/api")
    app.include_router(admin_router, prefix="/api")

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return app


def _seed_admin_user(db_session_factory):
    db = db_session_factory()
    try:
        user = User(
            username="admin1",
            hashed_password=hash_password("super-secret"),
            full_name="Pilot Admin",
            role="admin",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id
    finally:
        db.close()


def test_desktop_login_returns_bearer_token_and_admin_routes_accept_it(db_session_factory):
    admin_id = _seed_admin_user(db_session_factory)
    client = TestClient(_build_app(db_session_factory), client=("127.0.0.1", 50000))

    login_response = client.post(
        "/api/login",
        headers=DESKTOP_HEADERS,
        json={"username": "admin1", "password": "super-secret"},
    )

    assert login_response.status_code == 200
    auth_token = login_response.json().get("auth_token")
    assert isinstance(auth_token, str)
    assert auth_token

    check_auth_response = client.get(
        "/api/check-auth",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert check_auth_response.status_code == 200
    assert check_auth_response.json()["user"]["id"] == admin_id

    admin_users_response = client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {auth_token}"},
    )

    assert admin_users_response.status_code == 200
    assert admin_users_response.json()["total_users"] == 1


def test_browser_login_keeps_cookie_only_response_shape(db_session_factory):
    _seed_admin_user(db_session_factory)
    client = TestClient(_build_app(db_session_factory), client=("127.0.0.1", 50000))

    login_response = client.post(
        "/api/login",
        json={"username": "admin1", "password": "super-secret"},
    )

    assert login_response.status_code == 200
    assert login_response.json()["auth_token"] is None
