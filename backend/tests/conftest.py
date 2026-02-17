import os
import tempfile
from typing import Generator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.orchestration_apis.combined_dynamic_measurements_api import router as dynamic_router
from app.api.orchestration_apis.combined_panecho_echoprime_api import router as panecho_router
from app.api.orchestration_apis.llm_report_get_api import router as llm_results_router
from app.api.studies import router as studies_router
from app.api.orchestration_apis import combined_dynamic_measurements_api as dynamic_api
from app.api.orchestration_apis import combined_panecho_echoprime_api as panecho_api
from app.api.orchestration_apis import llm_report_get_api as llm_api
from app.database.db import Base, get_db
from app.database_models.patients import Patient
from app.database_models.studies import Study
from app.database_models.users import User
from app.helpers.authentication_functions import get_current_user_id


@pytest.fixture(scope="session")
def db_engine():
    # Ensure model metadata is imported before create_all.
    import app.database_models  # noqa: F401

    fd, db_path = tempfile.mkstemp(suffix="_test.db")
    os.close(fd)
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)

    try:
        yield engine
    finally:
        engine.dispose()
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.fixture(scope="session")
def db_session_factory(db_engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=db_engine)


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
def app(db_session_factory, seeded_study, monkeypatch):
    app = FastAPI()
    app.include_router(panecho_router, prefix="/api")
    app.include_router(dynamic_router, prefix="/api")
    app.include_router(llm_results_router, prefix="/api")
    app.include_router(studies_router, prefix="/api")

    def override_get_db() -> Generator:
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = lambda: seeded_study["user_id"]

    # Prevent background task execution of heavy inference/LLM paths in integration tests.
    monkeypatch.setattr(panecho_api, "combining_panecho_echoprime", lambda study_uid: None)
    monkeypatch.setattr(dynamic_api, "combining_dynamic_measurements", lambda study_uid: None)
    monkeypatch.setattr(llm_api, "generate_llm_report", lambda study_uid: None)

    return app
