from fastapi.testclient import TestClient

from app.core.artifacts import (
    DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
    PANECHO_ECHOPRIME_COMBINED_TYPE,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.patients import Patient
from app.database_models.studies import Study
from app.helpers.auth.authentication_functions import get_current_user_id


def _seed_completed_required_results(*, db, study_id: int) -> None:
    db.add(
        DerivedResult(
            study_id=study_id,
            type=PANECHO_ECHOPRIME_COMBINED_TYPE,
            status=ResultStatus.complete,
            value_json={"integrated_tasks": {}},
            model_name="PanEcho_EchoPrime_Combined",
            model_version="v1",
        )
    )
    db.add(
        DerivedResult(
            study_id=study_id,
            type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
            status=ResultStatus.complete,
            value_json={"instances": []},
            model_name="Dynamic_Measurements_Combined",
            model_version="v1",
        )
    )


def test_list_studies_computes_effective_status_without_persisting(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "false")

    db = db_session_factory()
    try:
        study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        study.status = "processing"
        _seed_completed_required_results(db=db, study_id=study.id)
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get("/api/studies")

    assert response.status_code == 200
    body = response.json()
    target = next((row for row in body if row.get("study_uid") == seeded_study["study_uid"]), None)
    assert target is not None
    assert target.get("status") == "completed"

    db = db_session_factory()
    try:
        study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        assert study.status == "processing"
    finally:
        db.close()


def test_retrieve_study_computes_effective_status_without_persisting(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "false")

    db = db_session_factory()
    try:
        study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        study.status = "processing"
        _seed_completed_required_results(db=db, study_id=study.id)
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}")

    assert response.status_code == 200
    assert response.json().get("status") == "completed"

    db = db_session_factory()
    try:
        study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        assert study.status == "processing"
    finally:
        db.close()


def test_delete_study_deletes_study_and_patient_when_last_study(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setattr("app.api.studies.delete_study_api.delete_study_from_orthanc", lambda _study_id: True)

    db = db_session_factory()
    try:
        study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        patient_id = study.patient_id
    finally:
        db.close()

    client = TestClient(app)
    response = client.delete(f"/api/studies/{seeded_study['study_id']}")
    assert response.status_code == 200
    assert response.json().get("ok") is True

    db = db_session_factory()
    try:
        deleted_study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        deleted_patient = db.query(Patient).filter(Patient.id == patient_id).first()
        assert deleted_study is None
        assert deleted_patient is None
    finally:
        db.close()


def test_delete_study_preserves_patient_when_other_studies_exist(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setattr("app.api.studies.delete_study_api.delete_study_from_orthanc", lambda _study_id: True)

    db = db_session_factory()
    try:
        study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        patient_id = study.patient_id
        user_id = study.user_id
        second = Study(
            study_uid=f"{seeded_study['study_uid']}-second",
            study_date="20260102",
            description="Second Study",
            study_orthanc_id=f"{seeded_study['study_uid']}-orthanc-second",
            status="processing",
            patient_id=patient_id,
            user_id=user_id,
        )
        db.add(second)
        db.commit()
        db.refresh(second)
        second_id = second.id
    finally:
        db.close()

    client = TestClient(app)
    response = client.delete(f"/api/studies/{seeded_study['study_id']}")
    assert response.status_code == 200
    assert response.json().get("ok") is True

    db = db_session_factory()
    try:
        deleted_study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        remaining_study = db.query(Study).filter(Study.id == second_id).first()
        remaining_patient = db.query(Patient).filter(Patient.id == patient_id).first()
        assert deleted_study is None
        assert remaining_study is not None
        assert remaining_patient is not None
    finally:
        db.close()


def test_study_mutation_routes_return_404_for_non_owner(app, db_session_factory, seeded_study):
    client = TestClient(app)
    app.dependency_overrides[get_current_user_id] = lambda: seeded_study["user_id"] + 1000

    patch_response = client.patch(
        f"/api/studies/{seeded_study['study_id']}",
        json={"study_date": "20260102"},
    )
    assert patch_response.status_code == 404

    delete_response = client.delete(f"/api/studies/{seeded_study['study_id']}")
    assert delete_response.status_code == 404

    instances_response = client.get(f"/api/studies/{seeded_study['study_uid']}/instances")
    assert instances_response.status_code == 404

    patient_response = client.get(f"/api/{seeded_study['study_uid']}/patient")
    assert patient_response.status_code == 404

    db = db_session_factory()
    try:
        study = db.query(Study).filter(Study.id == seeded_study["study_id"]).first()
        assert study is not None
    finally:
        db.close()
