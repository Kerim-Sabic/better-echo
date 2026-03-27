from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.admin import router as admin_router
from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import get_current_user_id, verify_password


def _build_app(db_session_factory, auth_state):
    app = FastAPI()
    app.include_router(admin_router, prefix="/api")

    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = lambda: auth_state["user_id"]
    return app


def _seed_user(db_session_factory, *, username, full_name, role, hashed_password="hashed"):
    db = db_session_factory()
    try:
        user = User(
            username=username,
            hashed_password=hashed_password,
            full_name=full_name,
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id
    finally:
        db.close()


def test_admin_can_list_users_with_seat_usage(db_session_factory):
    admin_id = _seed_user(
        db_session_factory,
        username="admin1",
        full_name="Admin One",
        role="admin",
    )
    _seed_user(
        db_session_factory,
        username="doctor1",
        full_name="Doctor One",
        role="doctor",
    )
    auth_state = {"user_id": admin_id}
    client = TestClient(_build_app(db_session_factory, auth_state), client=("127.0.0.1", 50000))

    response = client.get("/api/admin/users")

    assert response.status_code == 200
    response_body = response.json()
    assert response_body["total_users"] == 2
    assert response_body["max_users"] == 6
    assert [user["username"] for user in response_body["users"]] == ["admin1", "doctor1"]


def test_non_admin_is_forbidden_from_user_management(db_session_factory):
    admin_id = _seed_user(
        db_session_factory,
        username="admin1",
        full_name="Admin One",
        role="admin",
    )
    doctor_id = _seed_user(
        db_session_factory,
        username="doctor1",
        full_name="Doctor One",
        role="doctor",
    )
    auth_state = {"user_id": doctor_id}
    client = TestClient(_build_app(db_session_factory, auth_state), client=("127.0.0.1", 50000))

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
        f"/api/admin/users/{admin_id}",
        json={
            "username": "admin1-updated",
            "full_name": "Admin Updated",
            "role": "admin",
            "password": "new-secret",
        },
    )
    delete_response = client.delete(f"/api/admin/users/{admin_id}")

    assert list_response.status_code == 403
    assert create_response.status_code == 403
    assert update_response.status_code == 403
    assert delete_response.status_code == 403


def test_admin_can_create_user_and_password_is_hashed(db_session_factory):
    admin_id = _seed_user(
        db_session_factory,
        username="admin1",
        full_name="Admin One",
        role="admin",
    )
    auth_state = {"user_id": admin_id}
    client = TestClient(_build_app(db_session_factory, auth_state), client=("127.0.0.1", 50000))

    response = client.post(
        "/api/admin/users",
        json={
            "username": "doctor1",
            "password": "secret-1",
            "full_name": "Doctor One",
            "role": "doctor",
        },
    )

    assert response.status_code == 201
    response_body = response.json()
    assert response_body["message"] == "User created successfully."
    assert response_body["total_users"] == 2
    assert response_body["max_users"] == 6
    assert response_body["user"]["role"] == "doctor"

    db = db_session_factory()
    try:
        created_user = db.query(User).filter(User.username == "doctor1").first()
        assert created_user is not None
        assert created_user.hashed_password != "secret-1"
        assert verify_password("secret-1", created_user.hashed_password)
    finally:
        db.close()


def test_admin_cannot_create_user_when_seat_cap_is_reached(db_session_factory):
    admin_id = _seed_user(
        db_session_factory,
        username="admin1",
        full_name="Admin One",
        role="admin",
    )
    for index in range(2, 7):
        _seed_user(
            db_session_factory,
            username=f"user{index}",
            full_name=f"User {index}",
            role="doctor",
        )

    auth_state = {"user_id": admin_id}
    client = TestClient(_build_app(db_session_factory, auth_state), client=("127.0.0.1", 50000))

    response = client.post(
        "/api/admin/users",
        json={
            "username": "overflow-user",
            "password": "secret-overflow",
            "full_name": "Overflow User",
            "role": "doctor",
        },
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "User limit reached. This server allows at most 6 users."
    }


def test_admin_can_update_user_and_reset_password(db_session_factory):
    admin_id = _seed_user(
        db_session_factory,
        username="admin1",
        full_name="Admin One",
        role="admin",
    )
    doctor_id = _seed_user(
        db_session_factory,
        username="doctor1",
        full_name="Doctor One",
        role="doctor",
    )
    auth_state = {"user_id": admin_id}
    client = TestClient(_build_app(db_session_factory, auth_state), client=("127.0.0.1", 50000))

    response = client.put(
        f"/api/admin/users/{doctor_id}",
        json={
            "username": "doctor1-updated",
            "full_name": "Doctor One Updated",
            "role": "admin",
            "password": "new-secret-1",
        },
    )

    assert response.status_code == 200
    response_body = response.json()
    assert response_body["message"] == "User updated successfully."
    assert response_body["user"]["username"] == "doctor1-updated"
    assert response_body["user"]["full_name"] == "Doctor One Updated"
    assert response_body["user"]["role"] == "admin"

    db = db_session_factory()
    try:
        updated_user = db.query(User).filter(User.id == doctor_id).first()
        assert updated_user is not None
        assert updated_user.username == "doctor1-updated"
        assert updated_user.full_name == "Doctor One Updated"
        assert updated_user.role == "admin"
        assert verify_password("new-secret-1", updated_user.hashed_password)
    finally:
        db.close()


def test_admin_delete_guards_and_success_path(db_session_factory):
    primary_admin_id = _seed_user(
        db_session_factory,
        username="admin1",
        full_name="Admin One",
        role="admin",
    )
    doctor_id = _seed_user(
        db_session_factory,
        username="doctor1",
        full_name="Doctor One",
        role="doctor",
    )
    auth_state = {"user_id": primary_admin_id}
    client = TestClient(_build_app(db_session_factory, auth_state), client=("127.0.0.1", 50000))

    self_delete_response = client.delete(f"/api/admin/users/{primary_admin_id}")
    assert self_delete_response.status_code == 409
    assert self_delete_response.json() == {
        "detail": "Admins cannot delete their own account."
    }

    second_admin_id = _seed_user(
        db_session_factory,
        username="admin2",
        full_name="Admin Two",
        role="admin",
    )
    second_admin_client = TestClient(
        _build_app(db_session_factory, {"user_id": second_admin_id}),
        client=("127.0.0.1", 50000),
    )

    delete_last_admin_response = second_admin_client.delete(f"/api/admin/users/{primary_admin_id}")
    assert delete_last_admin_response.status_code == 200
    assert delete_last_admin_response.json()["total_users"] == 2

    delete_doctor_response = second_admin_client.delete(f"/api/admin/users/{doctor_id}")
    assert delete_doctor_response.status_code == 200
    assert delete_doctor_response.json() == {
        "message": "User deleted successfully.",
        "total_users": 1,
        "max_users": 6,
    }

    delete_last_admin_blocked = second_admin_client.delete(f"/api/admin/users/{second_admin_id}")
    assert delete_last_admin_blocked.status_code == 409
    assert delete_last_admin_blocked.json() == {
        "detail": "Admins cannot delete their own account."
    }

    db = db_session_factory()
    try:
        assert db.query(User).filter(User.id == doctor_id).first() is None
        remaining_admins = db.query(User).filter(User.role == "admin").all()
        assert len(remaining_admins) == 1
        assert remaining_admins[0].id == second_admin_id
    finally:
        db.close()


def test_admin_user_management_is_rejected_from_non_local_client(db_session_factory):
    admin_id = _seed_user(
        db_session_factory,
        username="admin1",
        full_name="Admin One",
        role="admin",
    )
    client = TestClient(
        _build_app(db_session_factory, {"user_id": admin_id}),
        client=("192.168.10.25", 50000),
    )

    response = client.get("/api/admin/users")

    assert response.status_code == 403
    assert response.json() == {
        "detail": "This server setup action is only available from the local server machine."
    }
