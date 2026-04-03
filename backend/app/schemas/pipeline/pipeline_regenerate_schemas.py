from datetime import datetime

from pydantic import BaseModel

from app.database_models.pipeline_jobs import PipelineJobStatus, PipelineRunMode


class PipelineRegenerateResponse(BaseModel):
    created_new: bool
    job_id: int
    status: PipelineJobStatus
    run_mode: PipelineRunMode
    queued_at: datetime
    message: str

