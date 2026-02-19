from typing import Any, Dict, Optional, Union, Annotated, Literal
from pydantic import BaseModel, Field

class CombinedSections(BaseModel):
    """Structured payload built by build_combined_sections_from_row()"""
    integrated_tasks: Dict[str, Any] = Field(default_factory=dict)
    overrides: Dict[str, Any] = Field(default_factory=dict)
    overrides_updated_at: Optional[str] = None

class CompleteResponse(BaseModel):
    status: Literal["complete"]
    panecho_echoprime_results: CombinedSections

class PendingResponse(BaseModel):
    status: Literal["pending"]
    retry_after: int = Field(..., ge=1)

class FailedResponse(BaseModel):
    status: Literal["failed"]
    detail: Optional[str] = None

CombinedResultsResponse = Annotated[
    Union[CompleteResponse, PendingResponse, FailedResponse],
    Field(discriminator="status"),
]
