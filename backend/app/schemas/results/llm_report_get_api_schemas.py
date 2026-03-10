from pydantic import BaseModel, Field
from typing import Any, Literal, Annotated, Union

class LLMCompleteResponse(BaseModel):
    status: Literal["complete"]
    llm_report: Any

class LLMPendingResponse(BaseModel):
    status: Literal["pending"]
    retry_after: int

class LLMFailedResponse(BaseModel):
    status: Literal["failed"]
    detail: str | None = None

LLMReportResponse = Annotated[
    Union[LLMCompleteResponse, LLMPendingResponse, LLMFailedResponse],
    Field(discriminator="status"),
]
