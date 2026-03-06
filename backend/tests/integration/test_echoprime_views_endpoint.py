from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.inference import router as inference_router
from app.database.db import get_db


def test_echoprime_views_route_is_exposed_in_openapi():
    # Part 1. Build minimal app with inference routes.
    app = FastAPI()
    app.include_router(inference_router, prefix="/api")
    client = TestClient(app)

    # Part 2. Confirm the dedicated view-classification route exists.
    openapi = client.get("/openapi.json").json()
    assert "/api/infer/echoprime/views" in openapi["paths"]


def test_echoprime_views_route_returns_service_payload(monkeypatch):
    # Part 1. Build app and inject no-op DB dependency.
    app = FastAPI()
    app.include_router(inference_router, prefix="/api")

    def _override_get_db():
        yield None

    app.dependency_overrides[get_db] = _override_get_db

    # Part 2. Stub service call used by route wrapper.
    fake_views = {
        "sop-1": {"view": "A4C", "confidence": 0.99, "file_path": "/tmp/a4c.dcm"},
        "sop-2": {"view": "PARASTERNAL_LONG", "confidence": 0.95, "file_path": "/tmp/plax.dcm"},
    }

    def _fake_classify(study_uid, db, include_file_paths=None):
        assert study_uid == "study-123"
        return fake_views

    monkeypatch.setattr(
        "app.api.inference.infer_echoprime_api.classify_views_for_study",
        _fake_classify,
    )

    # Part 3. Call endpoint and verify wrapper response shape.
    client = TestClient(app)
    response = client.post(
        "/api/infer/echoprime/views",
        json={"study_uid": "study-123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["study_uid"] == "study-123"
    assert body["num_instances"] == 2
    assert body["updated_instances"] == 2
    assert body["views"] == fake_views
