from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.api.health import health_api


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(health_api.router, prefix="/api")
    return TestClient(app)


def test_health_check_reports_database_ready(monkeypatch):
    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, _statement):
            return None

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(health_api, "engine", Engine())

    response = _client().get("/api/health")

    assert response.status_code == 200
    assert response.json()["database"] == "ok"


def test_health_check_returns_503_when_database_is_unavailable(monkeypatch):
    class Engine:
        def connect(self):
            raise OperationalError("SELECT 1", {}, RuntimeError("database down"))

    monkeypatch.setattr(health_api, "engine", Engine())

    response = _client().get("/api/health")

    assert response.status_code == 503
    assert response.json()["detail"] == "Database unavailable"
