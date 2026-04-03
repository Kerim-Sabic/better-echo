from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.artifacts import COMBINED_ANALYSIS_TYPE
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.database_models.pipeline_artifact_sets import (
    PipelineArtifactSet,
    PipelineArtifactSetState,
)
from app.database_models.pipeline_jobs import PipelineJob, PipelineJobStatus
from app.database_models.series import Series
from app.database_models.studies import Study


# Part 1. Study ownership resolver for queue APIs.
def _resolve_owned_study_or_404(db: Session, study_uid: str, user_id: int) -> Study:
    study = (
        db.query(Study)
        .filter(Study.study_uid == study_uid, Study.user_id == user_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return study


# Part 2. Active queue-job query helper.
def _active_job_query(db: Session, study_id: int):
    return (
        db.query(PipelineJob)
        .filter(
            PipelineJob.study_id == study_id,
            PipelineJob.status.in_([PipelineJobStatus.queued, PipelineJobStatus.running]),
        )
        .order_by(PipelineJob.queued_at.desc(), PipelineJob.id.desc())
    )


# Part 3. Current study-input revision helper.
def _count_study_instances(db: Session, study_id: int) -> int:
    return (
        db.query(Instance)
        .join(Series, Instance.series_id == Series.id)
        .filter(Series.study_id == study_id)
        .count()
    )


# Part 4. Artifact set lookup by study + state.
def _get_latest_artifact_set_for_study(
    db: Session,
    *,
    study_id: int,
    state: PipelineArtifactSetState,
) -> Optional[PipelineArtifactSet]:
    return (
        db.query(PipelineArtifactSet)
        .filter(
            PipelineArtifactSet.study_id == study_id,
            PipelineArtifactSet.state == state,
        )
        .order_by(PipelineArtifactSet.id.desc())
        .first()
    )


# Part 5. Draft artifact set lookup for a specific queue job.
def _get_draft_artifact_set_for_job(db: Session, *, job_id: int) -> Optional[PipelineArtifactSet]:
    return (
        db.query(PipelineArtifactSet)
        .filter(
            PipelineArtifactSet.pipeline_job_id == job_id,
            PipelineArtifactSet.state == PipelineArtifactSetState.draft,
        )
        .order_by(PipelineArtifactSet.id.desc())
        .first()
    )


# Part 6. Active combined baseline guard for regenerate mode.
def _has_active_combined_baseline(db: Session, *, study_id: int) -> bool:
    # Part 6.1 Accept active artifact-set scoped combined baseline.
    active_set = _get_latest_artifact_set_for_study(
        db,
        study_id=study_id,
        state=PipelineArtifactSetState.active,
    )
    if active_set:
        active_row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == study_id,
                DerivedResult.type == COMBINED_ANALYSIS_TYPE,
                DerivedResult.artifact_set_id == active_set.id,
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )
        if active_row:
            return True

    # Part 6.2 Transitional fallback for legacy non-artifact combined rows.
    legacy_row = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == study_id,
            DerivedResult.type == COMBINED_ANALYSIS_TYPE,
            DerivedResult.artifact_set_id.is_(None),
        )
        .order_by(DerivedResult.id.desc())
        .first()
    )
    return legacy_row is not None


# Part 7. Promote exactly this job's draft set and discard current active set.
def _promote_draft_artifact_set_for_job(db: Session, *, study: Study, job: PipelineJob) -> int:
    draft_set = _get_draft_artifact_set_for_job(db, job_id=job.id)
    if not draft_set:
        raise RuntimeError("Draft artifact set not found for completed regenerate job")

    now = datetime.utcnow()
    previous_active = _get_latest_artifact_set_for_study(
        db,
        study_id=study.id,
        state=PipelineArtifactSetState.active,
    )
    if previous_active and previous_active.id != draft_set.id:
        previous_active.state = PipelineArtifactSetState.discarded
        previous_active.discarded_at = now

    draft_set.state = PipelineArtifactSetState.active
    draft_set.promoted_at = now
    return draft_set.id


# Part 8. Ensure active artifact set exists and backfill legacy study-level rows.
def _ensure_active_artifact_set_and_backfill(db: Session, *, study_id: int) -> PipelineArtifactSet:
    # Part 8.1 Reuse active set if already present.
    active_set = _get_latest_artifact_set_for_study(
        db,
        study_id=study_id,
        state=PipelineArtifactSetState.active,
    )
    if not active_set:
        active_set = PipelineArtifactSet(
            study_id=study_id,
            pipeline_job_id=None,
            state=PipelineArtifactSetState.active,
            input_revision=_count_study_instances(db, study_id),
        )
        db.add(active_set)
        db.flush()

    # Part 8.2 Backfill legacy study-level artifacts into active set.
    legacy_rows = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == study_id,
            DerivedResult.instance_id.is_(None),
            DerivedResult.artifact_set_id.is_(None),
        )
        .all()
    )
    for row in legacy_rows:
        row.artifact_set_id = active_set.id

    return active_set


# Part 9. Create draft artifact set for a new queue job.
def _create_draft_artifact_set_for_job(db: Session, *, job: PipelineJob) -> PipelineArtifactSet:
    draft_set = PipelineArtifactSet(
        study_id=job.study_id,
        pipeline_job_id=job.id,
        state=PipelineArtifactSetState.draft,
        input_revision=_count_study_instances(db, job.study_id),
    )
    db.add(draft_set)
    return draft_set


__all__ = [
    "_resolve_owned_study_or_404",
    "_active_job_query",
    "_count_study_instances",
    "_get_latest_artifact_set_for_study",
    "_get_draft_artifact_set_for_job",
    "_has_active_combined_baseline",
    "_promote_draft_artifact_set_for_job",
    "_ensure_active_artifact_set_and_backfill",
    "_create_draft_artifact_set_for_job",
]

