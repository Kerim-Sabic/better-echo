from pydantic import BaseModel


class PipelinePromoteResponse(BaseModel):
    ok: bool
    state: str
    job_id: int | None = None
    promoted_artifact_set_id: int | None = None
    discarded_artifact_set_id: int | None = None
    message: str
    retry_after: int | None = None
