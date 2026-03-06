from fastapi import HTTPException

from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet, PipelineArtifactSetState
from app.database_models.pipeline_jobs import PipelineCleanupScope, PipelineJob, PipelineJobStatus, PipelineRunMode
from app.database_models.pipeline_stage_runs import PipelineStageRun
from app.services.pipeline.internal.registry import STAGE_HANDLER_MAP
from app.services.pipeline.service import (
    cancel_pipeline_job,
    promote_latest_draft_artifact_set,
    run_pending_jobs_once,
    start_pipeline_job,
)


def test_start_pipeline_job_builds_default_stage_set_without_llm(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        job, created_new = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        assert created_new is True

        stages = (
            db.query(PipelineStageRun)
            .filter(PipelineStageRun.pipeline_job_id == job.id)
            .order_by(PipelineStageRun.id.asc())
            .all()
        )
        assert [row.stage_name for row in stages] == [
            "prefilter",
            "combined",
            "dynamic_measurements",
        ]

        active_set = (
            db.query(PipelineArtifactSet)
            .filter(
                PipelineArtifactSet.study_id == seeded_study["study_id"],
                PipelineArtifactSet.state == PipelineArtifactSetState.active,
            )
            .first()
        )
        draft_set = (
            db.query(PipelineArtifactSet)
            .filter(
                PipelineArtifactSet.pipeline_job_id == job.id,
                PipelineArtifactSet.state == PipelineArtifactSetState.draft,
            )
            .first()
        )
        assert active_set is not None
        assert draft_set is not None
    finally:
        db.close()


def test_start_pipeline_job_adds_llm_stage_when_enabled(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "true")
    db = db_session_factory()
    try:
        job, created_new = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        assert created_new is True

        stages = (
            db.query(PipelineStageRun)
            .filter(PipelineStageRun.pipeline_job_id == job.id)
            .order_by(PipelineStageRun.id.asc())
            .all()
        )
        assert [row.stage_name for row in stages] == [
            "prefilter",
            "combined",
            "dynamic_measurements",
            "llm",
        ]
    finally:
        db.close()


def test_start_pipeline_job_regenerate_combined_stage_only(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "true")
    db = db_session_factory()
    try:
        baseline_combined = DerivedResult(
            study_id=seeded_study["study_id"],
            type=PANECHO_ECHOPRIME_COMBINED_TYPE,
            status=ResultStatus.complete,
            value_json={"integrated_tasks": {}},
            model_name="PanEcho_EchoPrime_Combined",
            model_version="v1",
            instance_id=None,
            artifact_set_id=None,
        )
        db.add(baseline_combined)
        db.commit()

        job, created_new = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.regenerate_combined,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        assert created_new is True

        stages = (
            db.query(PipelineStageRun)
            .filter(PipelineStageRun.pipeline_job_id == job.id)
            .order_by(PipelineStageRun.id.asc())
            .all()
        )
        assert [row.stage_name for row in stages] == ["combined"]
    finally:
        db.close()


def test_start_pipeline_job_regenerate_requires_active_combined_baseline(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        try:
            start_pipeline_job(
                db=db,
                study_uid=seeded_study["study_uid"],
                user_id=seeded_study["user_id"],
                run_mode=PipelineRunMode.regenerate_combined,
                cleanup_scope=PipelineCleanupScope.none,
                uploaded_instance_uids=[],
            )
            assert False, "Expected regenerate_combined start to fail without active baseline"
        except HTTPException as exc:
            assert exc.status_code == 409
    finally:
        db.close()


def test_start_pipeline_job_is_idempotent_when_active_exists(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        first_job, created_first = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        second_job, created_second = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )

        assert created_first is True
        assert created_second is False
        assert first_job.id == second_job.id
    finally:
        db.close()


def test_start_pipeline_job_backfills_study_level_legacy_results_into_active_set(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        legacy_row = DerivedResult(
            study_id=seeded_study["study_id"],
            type=PANECHO_ECHOPRIME_COMBINED_TYPE,
            status=ResultStatus.complete,
            value_json={"integrated_tasks": {}},
            model_name="PanEcho_EchoPrime_Combined",
            model_version="v1",
            instance_id=None,
            artifact_set_id=None,
        )
        db.add(legacy_row)
        db.commit()

        _, created_new = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        assert created_new is True

        db.refresh(legacy_row)
        assert legacy_row.artifact_set_id is not None
        linked_set = db.query(PipelineArtifactSet).filter(PipelineArtifactSet.id == legacy_row.artifact_set_id).first()
        assert linked_set is not None
        assert linked_set.state == PipelineArtifactSetState.active
    finally:
        db.close()


def test_promote_latest_draft_artifact_set_returns_pending_for_active_job(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        job, _ = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        result = promote_latest_draft_artifact_set(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
        )
        assert result["state"] == "pending"
        assert result["job_id"] == job.id
        assert result["retry_after"] == 3
        db.refresh(job)
        assert job.auto_promote_on_complete is True
    finally:
        db.close()


def test_promote_latest_draft_artifact_set_fails_without_job_or_draft(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        try:
            promote_latest_draft_artifact_set(
                db=db,
                study_uid=seeded_study["study_uid"],
                user_id=seeded_study["user_id"],
            )
            assert False, "Expected promote to fail when no job context exists"
        except HTTPException as exc:
            assert exc.status_code == 409
    finally:
        db.close()


def test_pending_promote_intent_auto_promotes_when_job_completes(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        job, _ = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        pending = promote_latest_draft_artifact_set(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
        )
        assert pending["state"] == "pending"

        for _ in range(6):
            run_pending_jobs_once(db=db, max_active_studies=16)
            db.refresh(job)
            if job.status == PipelineJobStatus.completed:
                break
        assert job.status == PipelineJobStatus.completed
        assert job.auto_promote_on_complete is False

        active_set = (
            db.query(PipelineArtifactSet)
            .filter(
                PipelineArtifactSet.study_id == seeded_study["study_id"],
                PipelineArtifactSet.state == PipelineArtifactSetState.active,
            )
            .order_by(PipelineArtifactSet.id.desc())
            .first()
        )
        assert active_set is not None
        assert active_set.pipeline_job_id == job.id

        draft_set = (
            db.query(PipelineArtifactSet)
            .filter(
                PipelineArtifactSet.pipeline_job_id == job.id,
                PipelineArtifactSet.state == PipelineArtifactSetState.draft,
            )
            .first()
        )
        assert draft_set is None
    finally:
        db.close()


def test_cancel_pipeline_job_marks_running_job_cancel_requested_then_scheduler_cancels(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        job, _ = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        job.status = PipelineJobStatus.running
        db.commit()

        result = cancel_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
        )
        assert result["cancel_requested"] is True

        run_pending_jobs_once(db=db, max_active_studies=4)
        db.refresh(job)
        assert job.status == PipelineJobStatus.cancelled
    finally:
        db.close()


def test_cancel_pipeline_job_discards_completed_preview_draft(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        job, _ = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        run_pending_jobs_once(db=db, max_active_studies=4)
        db.refresh(job)
        assert job.status == PipelineJobStatus.completed

        result = cancel_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
        )
        assert result["status"] == PipelineJobStatus.cancelled.value
        db.refresh(job)
        assert job.status == PipelineJobStatus.cancelled

        discarded_draft = (
            db.query(PipelineArtifactSet)
            .filter(
                PipelineArtifactSet.pipeline_job_id == job.id,
                PipelineArtifactSet.state == PipelineArtifactSetState.discarded,
            )
            .first()
        )
        assert discarded_draft is not None
    finally:
        db.close()


def test_regenerate_combined_auto_promotes_and_preserves_overrides(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        baseline_overrides = {"lvef": {"value": 44.0}}
        baseline_combined = DerivedResult(
            study_id=seeded_study["study_id"],
            type=PANECHO_ECHOPRIME_COMBINED_TYPE,
            status=ResultStatus.complete,
            value_json={
                "integrated_tasks": {"lvef": {"value": 50.0}},
                "overrides": baseline_overrides,
                "overrides_updated_at": "2026-02-25T12:00:00Z",
            },
            model_name="PanEcho_EchoPrime_Combined",
            model_version="v1",
            instance_id=None,
            artifact_set_id=None,
        )
        db.add(baseline_combined)
        db.commit()

        job, _ = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.regenerate_combined,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )

        run_pending_jobs_once(db=db, max_active_studies=2)
        db.refresh(job)
        assert job.status == PipelineJobStatus.completed

        active_set = (
            db.query(PipelineArtifactSet)
            .filter(
                PipelineArtifactSet.study_id == seeded_study["study_id"],
                PipelineArtifactSet.state == PipelineArtifactSetState.active,
            )
            .order_by(PipelineArtifactSet.id.desc())
            .first()
        )
        assert active_set is not None
        assert active_set.pipeline_job_id == job.id

        active_combined = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == seeded_study["study_id"],
                DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
                DerivedResult.artifact_set_id == active_set.id,
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )
        assert active_combined is not None
        assert active_combined.value_json.get("overrides") == baseline_overrides
    finally:
        db.close()


def test_regenerate_combined_failure_keeps_previous_active_set(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        baseline_combined = DerivedResult(
            study_id=seeded_study["study_id"],
            type=PANECHO_ECHOPRIME_COMBINED_TYPE,
            status=ResultStatus.complete,
            value_json={"integrated_tasks": {"lvef": {"value": 50.0}}},
            model_name="PanEcho_EchoPrime_Combined",
            model_version="v1",
            instance_id=None,
            artifact_set_id=None,
        )
        db.add(baseline_combined)
        db.commit()

        # Create baseline active artifact set assignment through queue bootstrap.
        bootstrap_job, _ = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        db.refresh(bootstrap_job)
        baseline_active_set = (
            db.query(PipelineArtifactSet)
            .filter(
                PipelineArtifactSet.study_id == seeded_study["study_id"],
                PipelineArtifactSet.state == PipelineArtifactSetState.active,
            )
            .order_by(PipelineArtifactSet.id.desc())
            .first()
        )
        assert baseline_active_set is not None

        # Cancel bootstrap queued job so regenerate can be enqueued in same test.
        bootstrap_job.status = PipelineJobStatus.cancelled
        db.commit()

        def _fail_combined_stage(*args, **kwargs):
            raise RuntimeError("forced_regenerate_failure")

        monkeypatch.setitem(STAGE_HANDLER_MAP, "combined", _fail_combined_stage)

        regen_job, _ = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.regenerate_combined,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )

        run_pending_jobs_once(db=db, max_active_studies=2)
        db.refresh(regen_job)
        assert regen_job.status == PipelineJobStatus.failed

        active_after_failure = (
            db.query(PipelineArtifactSet)
            .filter(
                PipelineArtifactSet.study_id == seeded_study["study_id"],
                PipelineArtifactSet.state == PipelineArtifactSetState.active,
            )
            .order_by(PipelineArtifactSet.id.desc())
            .first()
        )
        assert active_after_failure is not None
        assert active_after_failure.id == baseline_active_set.id
    finally:
        db.close()


def test_run_pending_jobs_once_handles_deleted_job_row_during_stage_failure(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    monkeypatch.setenv("ENABLE_LLM", "false")
    db = db_session_factory()
    try:
        job, _ = start_pipeline_job(
            db=db,
            study_uid=seeded_study["study_uid"],
            user_id=seeded_study["user_id"],
            run_mode=PipelineRunMode.upload_preview,
            cleanup_scope=PipelineCleanupScope.none,
            uploaded_instance_uids=[],
        )
        job_id = job.id

        # Part 1. Simulate concurrent deletion while scheduler processes a queued job.
        def _delete_then_fail(*, db, job, **kwargs):
            db.query(PipelineJob).filter(PipelineJob.id == job.id).delete(synchronize_session=False)
            db.commit()
            raise RuntimeError("forced_deleted_job_failure")

        monkeypatch.setattr(
            "app.services.pipeline.service._process_job_skeleton",
            _delete_then_fail,
        )

        processed = run_pending_jobs_once(db=db, max_active_studies=4)
        assert processed == 0
        assert db.query(PipelineJob).filter(PipelineJob.id == job_id).first() is None
    finally:
        db.close()
