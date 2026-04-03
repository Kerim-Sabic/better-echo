from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.database_models.pipeline_jobs import PipelineCleanupScope, PipelineJobStatus, PipelineRunMode
from app.database_models.pipeline_stage_runs import PipelineStageStatus


class PipelineStageSnapshot(BaseModel):
    stage_name: str
    status: PipelineStageStatus
    payload: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class ArtifactSetSnapshot(BaseModel):
    id: int
    state: str
    input_revision: Optional[int] = None
    pipeline_job_id: Optional[int] = None
    created_at: datetime
    promoted_at: Optional[datetime] = None
    discarded_at: Optional[datetime] = None


class PipelineArtifactSetsSnapshot(BaseModel):
    draft: Optional[ArtifactSetSnapshot] = None
    active: Optional[ArtifactSetSnapshot] = None


class PipelineJobSnapshot(BaseModel):
    job_id: int
    study_id: int
    status: PipelineJobStatus
    current_stage: Optional[str] = None
    run_mode: PipelineRunMode
    cleanup_scope: PipelineCleanupScope
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    cancel_requested_at: Optional[datetime] = None
    is_cancel_requested: bool = False
    updated_at: datetime
    last_error: Optional[str] = None
    uploaded_instance_uids: List[str] = Field(default_factory=list)
    stages: List[PipelineStageSnapshot] = Field(default_factory=list)
    artifact_sets: PipelineArtifactSetsSnapshot = Field(default_factory=PipelineArtifactSetsSnapshot)


class PipelineStatusResponse(BaseModel):
    has_job: bool
    pipeline: Optional[PipelineJobSnapshot] = None
