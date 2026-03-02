from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database_models.derived_results import DerivedResult
from app.database_models.pipeline_artifact_sets import (
    PipelineArtifactSet,
    PipelineArtifactSetState,
)
from app.database_models.pipeline_jobs import PipelineJob, PipelineJobStatus
from app.database_models.pipeline_stage_runs import PipelineStageRun, PipelineStageStatus
from app.database_models.studies import Study


def get_study_or_404(*, db: Session, study_uid: str) -> Study:
    # Part 1. Resolve study ownership target for observer endpoints.
    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return study


def get_active_artifact_set(*, db: Session, study_id: int) -> Optional[PipelineArtifactSet]:
    # Part 2. Read latest active artifact set for study.
    return (
        db.query(PipelineArtifactSet)
        .filter(
            PipelineArtifactSet.study_id == study_id,
            PipelineArtifactSet.state == PipelineArtifactSetState.active,
        )
        .order_by(PipelineArtifactSet.id.desc())
        .first()
    )


def get_active_or_legacy_result_row(
    *,
    db: Session,
    study_id: int,
    result_type: str,
) -> Optional[DerivedResult]:
    # Part 3. Prefer active artifact-set scoped result.
    active_set = get_active_artifact_set(db=db, study_id=study_id)
    if active_set:
        active_row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == study_id,
                DerivedResult.type == result_type,
                DerivedResult.artifact_set_id == active_set.id,
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )
        if active_row:
            return active_row

    # Part 4. Transitional fallback for legacy non-artifact rows.
    return (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == study_id,
            DerivedResult.type == result_type,
            DerivedResult.artifact_set_id.is_(None),
        )
        .order_by(DerivedResult.id.desc())
        .first()
    )


def get_latest_stage_failure_detail(
    *,
    db: Session,
    study_id: int,
    stage_names: Sequence[str],
) -> Optional[str]:
    # Part 5. Surface latest failed queue stage detail for observer-only GET endpoints.
    if not stage_names:
        return None
    failed_stage = (
        db.query(PipelineStageRun)
        .join(PipelineJob, PipelineStageRun.pipeline_job_id == PipelineJob.id)
        .filter(
            PipelineStageRun.study_id == study_id,
            PipelineStageRun.stage_name.in_(list(stage_names)),
            PipelineStageRun.status == PipelineStageStatus.failed,
            PipelineJob.status == PipelineJobStatus.failed,
        )
        .order_by(PipelineStageRun.finished_at.desc(), PipelineStageRun.id.desc())
        .first()
    )
    if not failed_stage:
        return None
    if failed_stage.error:
        return failed_stage.error
    return f"{failed_stage.stage_name} stage failed"


__all__ = [
    "get_study_or_404",
    "get_active_artifact_set",
    "get_active_or_legacy_result_row",
    "get_latest_stage_failure_detail",
]

