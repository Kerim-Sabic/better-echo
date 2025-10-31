from typing import List, Optional
from pydantic import BaseModel, Field


class LLMReportRequest(BaseModel):
    study_uid: str = Field(..., description="Study UID for which to generate the AI echo report")
    language: Optional[str] = Field(None, description="Preferred language (e.g., 'en')")
    style: Optional[str] = Field(None, description="Optional style hint (e.g., 'concise', 'detailed')")


class LLMReportResponse(BaseModel):
    study_uid: str
    model: str
    report: str
    diagnoses_json: list | None = None


class ChatTurn(BaseModel):
    role: str
    content: str


class LLMChatRequest(BaseModel):
    study_uid: str = Field(..., description="Study UID to anchor the conversation context")
    question: str = Field(..., description="User question about the study/report")
    history: Optional[List[ChatTurn]] = Field(None, description="Optional prior chat turns for continuity")


class LLMChatResponse(BaseModel):
    study_uid: str
    answer: str
    model: str
