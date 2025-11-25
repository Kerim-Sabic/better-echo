from pydantic import BaseModel, Field
from typing import Any, Literal, Annotated, Union

class LLMCompleteResponse(BaseModel):
    status: Literal["complete"]
    llm_report: Any

class LLMPendingResponse(BaseModel):
    status: Literal["pending"]
    retry_after: int

LLMReportResponse = Annotated[
    Union[LLMCompleteResponse, LLMPendingResponse],
    Field(discriminator="status"),
]