from fastapi.testclient import TestClient

from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet, PipelineArtifactSetState
from app.database_models.pipeline_jobs import PipelineJob, PipelineJobStatus
from app.database_models.pipeline_stage_runs import PipelineStageRun, PipelineStageStatus
from app.helpers.auth.authentication_functions import get_current_user_id
from app.services.pipeline.service import run_pending_jobs_once


def test_pipeline_start_is_idempotent_for_active_job(app, seeded_study):
    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    first = client.post(f"/api/studies/{study_uid}/pipeline/start", json={})
    assert first.status_code == 200
    body_first = first.json()
    assert body_first["created_new"] is True
    first_job_id = body_first["job_id"]

    second = client.post(f"/api/studies/{study_uid}/pipeline/start", json={})
    assert second.status_code == 200
    body_second = second.json()
    assert body_second["created_new"] is False
    assert body_second["job_id"] == first_job_id


def test_pipeline_status_returns_not_started_when_absent(app, seeded_study):
    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/pipeline/status")
    assert response.status_code == 200
    body = response.json()
    assert body["has_job"] is False
    assert body["pipeline"] is None


def test_pipeline_status_reflects_completed_skeleton_run(app, seeded_study, db_session_factory):
    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    start = client.post(f"/api/studies/{study_uid}/pipeline/start", json={})
    assert start.status_code == 200
    job_id = start.json()["job_id"]

    # Shared session DB can contain jobs from previous tests; process until this job completes.
    for _ in range(6):
        db = db_session_factory()
        try:
            run_pending_jobs_once(db=db, max_active_studies=8)
            job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
            if job and job.status == PipelineJobStatus.completed:
                break
        finally:
            db.close()

    status = client.get(f"/api/studies/{study_uid}/pipeline/status")
    assert status.status_code == 200
    body = status.json()
    assert body["has_job"] is True
    assert body["pipeline"]["status"] == "completed"
    assert body["pipeline"]["artifact_sets"]["draft"] is not None
    assert body["pipeline"]["artifact_sets"]["active"] is not None
    stages = body["pipeline"]["stages"]
    assert len(stages) >= 3
    assert all(stage["status"] == "completed" for stage in stages)

    db = db_session_factory()
    try:
        job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
        assert job.status == PipelineJobStatus.completed
        stage_rows = (
            db.query(PipelineStageRun)
            .filter(PipelineStageRun.pipeline_job_id == job.id)
            .all()
        )
        assert len(stage_rows) == len(stages)
        assert all(row.status == PipelineStageStatus.completed for row in stage_rows)
    finally:
        db.close()


def test_pipeline_status_blocks_cross_user_access(app, seeded_study):
    app.dependency_overrides[get_current_user_id] = lambda: seeded_study["user_id"] + 999
    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/pipeline/status")
    assert response.status_code == 404


def test_pipeline_promote_swaps_draft_to_active(app, seeded_study, db_session_factory):
    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    start = client.post(f"/api/studies/{study_uid}/pipeline/start", json={})
    assert start.status_code == 200
    job_id = start.json()["job_id"]

    for _ in range(6):
        db = db_session_factory()
        try:
            run_pending_jobs_once(db=db, max_active_studies=8)
            job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
            if job and job.status == PipelineJobStatus.completed:
                break
        finally:
            db.close()

    promote = client.post(f"/api/studies/{study_uid}/pipeline/promote")
    assert promote.status_code == 200
    promote_body = promote.json()
    assert promote_body["ok"] is True
    assert promote_body["state"] == "promoted"
    promoted_set_id = promote_body["promoted_artifact_set_id"]

    status = client.get(f"/api/studies/{study_uid}/pipeline/status")
    assert status.status_code == 200
    body = status.json()
    assert body["pipeline"]["artifact_sets"]["draft"] is None
    assert body["pipeline"]["artifact_sets"]["active"]["id"] == promoted_set_id

    db = db_session_factory()
    try:
        promoted_set = db.query(PipelineArtifactSet).filter(PipelineArtifactSet.id == promoted_set_id).first()
        assert promoted_set.state == PipelineArtifactSetState.active
    finally:
        db.close()


def test_pipeline_promote_returns_pending_and_auto_promotes_after_completion(app, seeded_study, db_session_factory):
    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    start = client.post(f"/api/studies/{study_uid}/pipeline/start", json={})
    assert start.status_code == 200
    job_id = start.json()["job_id"]

    promote = client.post(f"/api/studies/{study_uid}/pipeline/promote")
    assert promote.status_code == 202
    promote_body = promote.json()
    assert promote_body["ok"] is True
    assert promote_body["state"] == "pending"
    assert promote_body["job_id"] == job_id
    assert promote_body["retry_after"] == 3

    db = db_session_factory()
    try:
        run_pending_jobs_once(db=db, max_active_studies=8)
    finally:
        db.close()

    status = client.get(f"/api/studies/{study_uid}/pipeline/status")
    assert status.status_code == 200
    body = status.json()
    assert body["pipeline"]["status"] == "completed"
    assert body["pipeline"]["artifact_sets"]["draft"] is None
    assert body["pipeline"]["artifact_sets"]["active"]["pipeline_job_id"] == job_id


def test_pipeline_cancel_marks_queued_job_cancelled_and_discards_draft(app, seeded_study, db_session_factory):
    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    start = client.post(
        f"/api/studies/{study_uid}/pipeline/start",
        json={
            "cleanup_scope": "append_delta",
            "uploaded_instance_uids": ["missing-instance-uid"],
        },
    )
    assert start.status_code == 200
    job_id = start.json()["job_id"]

    cancel = client.post(f"/api/studies/{study_uid}/pipeline/cancel")
    assert cancel.status_code == 200
    cancel_body = cancel.json()
    assert cancel_body["ok"] is True
    assert cancel_body["status"] == "cancelled"
    assert cancel_body["cancel_requested"] is False

    db = db_session_factory()
    try:
        job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
        assert job.status == PipelineJobStatus.cancelled

        draft_rows = (
            db.query(PipelineArtifactSet)
            .filter(PipelineArtifactSet.pipeline_job_id == job_id)
            .all()
        )
        assert any(row.state == PipelineArtifactSetState.discarded for row in draft_rows)
    finally:
        db.close()


def test_pipeline_cancel_running_job_sets_cancel_request_then_scheduler_cancels(app, seeded_study, db_session_factory):
    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    start = client.post(f"/api/studies/{study_uid}/pipeline/start", json={})
    assert start.status_code == 200
    job_id = start.json()["job_id"]

    db = db_session_factory()
    try:
        job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
        job.status = PipelineJobStatus.running
        db.commit()
    finally:
        db.close()

    cancel = client.post(f"/api/studies/{study_uid}/pipeline/cancel")
    assert cancel.status_code == 200
    cancel_body = cancel.json()
    assert cancel_body["cancel_requested"] is True

    db = db_session_factory()
    try:
        run_pending_jobs_once(db=db, max_active_studies=8)
    finally:
        db.close()

    db = db_session_factory()
    try:
        job = db.query(PipelineJob).filter(PipelineJob.id == job_id).first()
        assert job.status == PipelineJobStatus.cancelled
    finally:
        db.close()


def test_pipeline_cancel_new_study_scope_deletes_study_row(app, seeded_study, monkeypatch):
    monkeypatch.setattr("app.services.pipeline.cleanup.delete_study_from_orthanc", lambda _study_id: True)

    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    start = client.post(
        f"/api/studies/{study_uid}/pipeline/start",
        json={"cleanup_scope": "new_study"},
    )
    assert start.status_code == 200

    cancel = client.post(f"/api/studies/{study_uid}/pipeline/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"

    # Study is removed for new_study cleanup scope.
    status = client.get(f"/api/studies/{study_uid}/pipeline/status")
    assert status.status_code == 404


def test_pipeline_regenerate_requires_active_combined_baseline(app, seeded_study):
    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    response = client.post(f"/api/studies/{study_uid}/pipeline/regenerate-combined")
    assert response.status_code == 409


def test_pipeline_regenerate_enqueues_and_auto_promotes(app, seeded_study, db_session_factory):
    client = TestClient(app)
    study_uid = seeded_study["study_uid"]

    db = db_session_factory()
    try:
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"integrated_tasks": {"lvef": {"value": 50.0}}},
                model_name="PanEcho_EchoPrime_Combined",
                model_version="v1",
                instance_id=None,
                artifact_set_id=None,
            )
        )
        db.commit()
    finally:
        db.close()

    start = client.post(f"/api/studies/{study_uid}/pipeline/regenerate-combined")
    assert start.status_code == 200
    body = start.json()
    assert body["created_new"] is True
    assert body["run_mode"] == "regenerate_combined"
    job_id = body["job_id"]

    db = db_session_factory()
    try:
        run_pending_jobs_once(db=db, max_active_studies=8)
    finally:
        db.close()

    status = client.get(f"/api/studies/{study_uid}/pipeline/status")
    assert status.status_code == 200
    pipeline = status.json()["pipeline"]
    assert pipeline["job_id"] == job_id
    assert pipeline["status"] == "completed"
    assert pipeline["artifact_sets"]["draft"] is None
    assert pipeline["artifact_sets"]["active"]["pipeline_job_id"] == job_id

