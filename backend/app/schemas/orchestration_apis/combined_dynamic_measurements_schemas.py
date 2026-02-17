from typing import Any, Dict, Union, Annotated, Literal
from pydantic import BaseModel, Field

class CompleteResponse(BaseModel):
    status: Literal["complete"]
    dynamic_measurements_results: Dict[str, Any] = Field(default_factory=dict)

class PendingResponse(BaseModel):
    status: Literal["pending"]
    retry_after: int = Field(..., ge=1)

class FailedResponse(BaseModel):
    status: Literal["failed"]
    detail: str | None = None

CombinedResultsResponse = Annotated[
    Union[CompleteResponse, PendingResponse, FailedResponse],
    Field(discriminator="status"),
]
