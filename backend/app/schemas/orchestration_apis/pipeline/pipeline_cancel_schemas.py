from typing import Any, Dict

from pydantic import BaseModel, Field


class PipelineCancelResponse(BaseModel):
    ok: bool
    job_id: int
    status: str
    cancel_requested: bool
    cleanup_scope: str
    cleanup_summary: Dict[str, Any] = Field(default_factory=dict)
    message: str

