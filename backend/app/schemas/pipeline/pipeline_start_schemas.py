from datetime import datetime
from typing import List

from pydantic import BaseModel, Field

from app.database_models.pipeline_jobs import PipelineCleanupScope, PipelineJobStatus, PipelineRunMode


class PipelineStartRequest(BaseModel):
    run_mode: PipelineRunMode = PipelineRunMode.upload_preview
    cleanup_scope: PipelineCleanupScope = PipelineCleanupScope.none
    uploaded_instance_uids: List[str] = Field(default_factory=list)


class PipelineStartResponse(BaseModel):
    created_new: bool
    job_id: int
    status: PipelineJobStatus
    run_mode: PipelineRunMode
    cleanup_scope: PipelineCleanupScope
    queued_at: datetime

