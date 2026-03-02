from pydantic import BaseModel


class PipelinePromoteResponse(BaseModel):
    ok: bool
    job_id: int
    promoted_artifact_set_id: int
    discarded_artifact_set_id: int | None = None
    message: str

