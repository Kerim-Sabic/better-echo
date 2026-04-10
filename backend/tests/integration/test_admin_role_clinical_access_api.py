from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.authentication import router as authentication_router
from app.api.pipeline.pipeline_start_api import router as pipeline_start_router
from app.api.results.combined_study_analysis_api import router as study_analysis_router
from app.api.studies.list_studies_api import router as list_studies_router
from app.api.studies.retrieve_study_api import router as retrieve_study_router
from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import hash_password


def _build_app(db_session_factory):
    app = FastAPI()
    app.include_router(authentication_router, prefix="/api")
    app.include_router(list_studies_router, prefix="/api")
    app.include_router(retrieve_study_router, prefix="/api")
    app.include_router(study_analysis_router, prefix="/api")
    app.include_router(pipeline_start_router, prefix="/api")

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
    finally:
        db.close()


def test_admin_user_is_blocked_from_clinical_routes(db_session_factory):
    _seed_admin_user(db_session_factory)
    client = TestClient(_build_app(db_session_factory), client=("127.0.0.1", 50000))

    login_response = client.post(
        "/api/login",
        json={"username": "admin1", "password": "super-secret"},
    )
    assert login_response.status_code == 200

    studies_response = client.get("/api/studies")
    assert studies_response.status_code == 403

    retrieve_response = client.get("/api/studies/nonexistent-study")
    assert retrieve_response.status_code == 403

    results_response = client.get("/api/studies/nonexistent-study/study-analysis-results")
    assert results_response.status_code == 403

    pipeline_response = client.post(
        "/api/studies/nonexistent-study/pipeline/start",
        json={"run_mode": "upload_preview", "cleanup_scope": "study", "uploaded_instance_uids": []},
    )
    assert pipeline_response.status_code == 403
