from pydantic import BaseModel
from typing import Any, Literal, Optional

class LLMPendingResponse(BaseModel):
    status: Literal["pending"]
    retry_after: int

class LLMCompleteResponse(BaseModel):
    status: Literal["complete"]
    llm_report: Any

LLMReportResponse = LLMPendingResponse | LLMCompleteResponse