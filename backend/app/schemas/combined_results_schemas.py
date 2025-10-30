from typing import Any, Dict, Union, Annotated, Literal
from pydantic import BaseModel, Field

class CombinedSections(BaseModel):
    """Structured payload built by build_combined_sections_from_row()"""
    panecho_echoprime_overlapping_tasks: Dict[str, Any] = Field(default_factory=dict)
    panecho_only_tasks: Dict[str, Any] = Field(default_factory=dict)
    echoprime_only_tasks: Dict[str, Any] = Field(default_factory=dict)
    disagreement_flags: Dict[str, Any] = Field(default_factory=dict)
    integrated_tasks: Dict[str, Any] = Field(default_factory=dict)

class CompleteResponse(BaseModel):
    status: Literal["complete"]
    panecho_echoprime_results: CombinedSections

class PendingResponse(BaseModel):
    status: Literal["pending"]
    retry_after: int = Field(..., ge=1)

CombinedResultsResponse = Annotated[
    Union[CompleteResponse, PendingResponse],
    Field(discriminator="status"),
]