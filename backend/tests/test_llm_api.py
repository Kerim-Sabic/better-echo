import json
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.db import Base, get_db
from app.models.patients import Patient
from app.models.studies import Study
from app.models.derived_results import DerivedResult, ResultStatus
from app.core.artifacts import COMBINED_TYPE, LLM_REPORT_TYPE


def make_inmemory_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return engine, TestingSessionLocal


def override_get_db(session_maker):
    def _get_db() -> Generator:
        db = session_maker()
        try:
            yield db
            db.commit()
        finally:
            db.close()
    return _get_db


class DummyResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_generate_report_success(monkeypatch):
    engine, TestingSessionLocal = make_inmemory_session()

    # Seed DB with a patient, study, and combined row
    db = TestingSessionLocal()
    p = Patient(
        patient_id="P1",
        patient_name="Test, Patient",
        patient_sex="M",
        patient_birth_date="19700101",
        patient_orthanc_id="orthanc-p1",
    )
    db.add(p)
    db.flush()

    s = Study(
        study_uid="1.2.3",
        study_orthanc_id="orthanc-study-123",
        patient_id=p.id,
        status="completed",
    )
    db.add(s)
    db.flush()

    combined = DerivedResult(
        study_id=s.id,
        type=COMBINED_TYPE,
        panecho_echoprime_overlapping_tasks={"EF_percent": {"from_panecho": 55.0, "to_echoprime": 54.0}},
        panecho_only_tasks={},
        echoprime_only_tasks={},
        disagreement_flags={},
        model_name="combined",
        model_version="v1",
        status=ResultStatus.complete,
    )
    db.add(combined)
    db.commit()
    db.close()

    # Override dependency to use our in-memory DB
    app.dependency_overrides[get_db] = override_get_db(TestingSessionLocal)

    # Mock requests.post used by LLMClient
    def _fake_post(url, json=None, headers=None, timeout=None):
        return DummyResp({
            "choices": [
                {"message": {"role": "assistant", "content": "Generated echo report text."}}
            ]
        })

    monkeypatch.setattr("requests.post", _fake_post)

    client = TestClient(app)
    res = client.post("/api/studies/1.2.3/llm/report/generate")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["report"] == "Generated echo report text."

    # Validate the report was persisted
    db = TestingSessionLocal()
    saved = db.query(DerivedResult).filter(DerivedResult.type == LLM_REPORT_TYPE).first()
    assert saved is not None
    saved_payload = json.loads(saved.value_json)
    assert saved_payload.get("report") == "Generated echo report text."
    db.close()


def test_chat_about_report_success(monkeypatch):
    engine, TestingSessionLocal = make_inmemory_session()

    # Seed DB with patient, study, combined row and an existing LLM report
    db = TestingSessionLocal()
    p = Patient(
        patient_id="P2",
        patient_name="Test, Two",
        patient_sex="F",
        patient_birth_date="19750101",
        patient_orthanc_id="orthanc-p2",
    )
    db.add(p)
    db.flush()

    s = Study(
        study_uid="9.8.7",
        study_orthanc_id="orthanc-study-987",
        patient_id=p.id,
        status="completed",
    )
    db.add(s)
    db.flush()

    combined = DerivedResult(
        study_id=s.id,
        type=COMBINED_TYPE,
        panecho_echoprime_overlapping_tasks={"EF_percent": {"from_panecho": 35.0, "to_echoprime": 36.0}},
        panecho_only_tasks={},
        echoprime_only_tasks={},
        disagreement_flags={},
        model_name="combined",
        model_version="v1",
        status=ResultStatus.complete,
    )
    db.add(combined)

    llm_report = DerivedResult(
        study_id=s.id,
        type=LLM_REPORT_TYPE,
        value_json=json.dumps({"report": "Preexisting generated report."}),
        model_name="LLM",
        model_version="v1",
        status=ResultStatus.complete,
    )
    db.add(llm_report)
    db.commit()
    db.close()

    app.dependency_overrides[get_db] = override_get_db(TestingSessionLocal)

    def _fake_post(url, json=None, headers=None, timeout=None):
        return DummyResp({
            "choices": [
                {"message": {"role": "assistant", "content": "Answer about EF and next steps."}}
            ]
        })

    monkeypatch.setattr("requests.post", _fake_post)

    client = TestClient(app)
    res = client.post("/api/llm/chat", json={"study_uid": "9.8.7", "question": "What is the EF and what does it mean?"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["answer"] == "Answer about EF and next steps."

