from typing import Generator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.api.pipeline.pipeline_cancel_api import router as pipeline_cancel_router
from app.api.pipeline.pipeline_promote_api import router as pipeline_promote_router
from app.api.pipeline.pipeline_regenerate_api import router as pipeline_regenerate_router
from app.api.pipeline.pipeline_start_api import router as pipeline_start_router
from app.api.pipeline.pipeline_status_api import router as pipeline_status_router
from app.api.results.combined_dynamic_measurements_api import router as dynamic_router
from app.api.results.combined_study_analysis_api import router as study_analysis_router
from app.api.results.llm_report_get_api import router as llm_results_router
from app.api.patients import router as patients_router
from app.api.studies import router as studies_router
from app.core.config import settings
from app.database.db import Base, get_db
from app.database_models.patients import Patient
from app.database_models.studies import Study
from app.database_models.users import User
from app.helpers.auth.authentication_functions import get_current_user_id
from app.services.auth.principal_service import (
    get_current_auth_principal,
    get_current_doctor_user_id,
    get_current_study_read_principal,
)

def _create_test_engine(database_url: str):
    return create_engine(database_url, pool_pre_ping=True)


def _assert_safe_test_database_url() -> None:
    test_database_url = settings.TEST_DATABASE_URL
    if not test_database_url:
        raise RuntimeError(
            "TEST_DATABASE_URL must be set for backend tests now that PostgreSQL is the active runtime path."
        )

    live_url = make_url(settings.DATABASE_URL)
    test_url = make_url(test_database_url)
    if live_url.render_as_string(hide_password=False) == test_url.render_as_string(hide_password=False):
        raise RuntimeError("TEST_DATABASE_URL must not point at the live application database.")


def _ensure_test_users_last_login_column(engine) -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    if "last_login_at" in existing_columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE NULL"
            )
        )


@pytest.fixture(scope="session")
def db_engine():
    # Ensure model metadata is imported before create_all.
    import app.database_models  # noqa: F401

    _assert_safe_test_database_url()
    database_url = settings.TEST_DATABASE_URL
    engine = _create_test_engine(database_url)
    Base.metadata.create_all(bind=engine)
    _ensure_test_users_last_login_column(engine)

    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture(scope="session")
def db_session_factory(db_engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=db_engine)


@pytest.fixture(autouse=True)
def reset_test_db(db_session_factory):
    # Part 1. Isolate tests by removing prior rows to avoid shared-DB queue/state bleed.
    db = db_session_factory()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def seeded_study(db_session_factory):
    db = db_session_factory()
    try:
        suffix = uuid4().hex[:8]

        user = User(
            username=f"test_user_{suffix}",
            hashed_password="hashed",
            full_name="Test User",
        )
        patient = Patient(
            patient_id=f"patient-{suffix}",
            patient_name="Test Patient",
            patient_sex="M",
            patient_birth_date="19800101",
            patient_orthanc_id=f"orthanc-patient-{suffix}",
        )
        study = Study(
            study_uid=f"study-uid-{suffix}",
            study_date="20260101",
            description="Test Study",
            study_orthanc_id=f"orthanc-study-{suffix}",
            status="processing",
            user=user,
            patient=patient,
        )

        db.add_all([user, patient, study])
        db.commit()
        db.refresh(study)

        return {
            "user_id": user.id,
            "study_uid": study.study_uid,
            "study_id": study.id,
        }
    finally:
        db.close()


@pytest.fixture()
def app(db_session_factory, seeded_study):
    app = FastAPI()
    app.include_router(study_analysis_router, prefix="/api")
    app.include_router(dynamic_router, prefix="/api")
    app.include_router(llm_results_router, prefix="/api")
    app.include_router(pipeline_start_router, prefix="/api")
    app.include_router(pipeline_status_router, prefix="/api")
    app.include_router(pipeline_promote_router, prefix="/api")
    app.include_router(pipeline_cancel_router, prefix="/api")
    app.include_router(pipeline_regenerate_router, prefix="/api")
    app.include_router(studies_router, prefix="/api")
    app.include_router(patients_router, prefix="/api")

    def override_get_db() -> Generator:
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = lambda: seeded_study["user_id"]
    app.dependency_overrides[get_current_doctor_user_id] = lambda: seeded_study["user_id"]
    app.dependency_overrides[get_current_auth_principal] = lambda: {
        "id": seeded_study["user_id"],
        "username": "test-doctor",
        "role": "doctor",
        "full_name": "Test Doctor",
        "principal_type": "user",
    }
    app.dependency_overrides[get_current_study_read_principal] = lambda: {
        "id": seeded_study["user_id"],
        "username": "test-doctor",
        "role": "doctor",
        "full_name": "Test Doctor",
        "principal_type": "user",
    }

    return app


