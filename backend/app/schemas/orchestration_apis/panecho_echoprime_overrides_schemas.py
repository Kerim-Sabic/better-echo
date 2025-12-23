from typing import Dict, Optional
from pydantic import BaseModel, Field

class OverrideItem(BaseModel):
    value: Optional[float] = None
    label: Optional[str] = None

class OverridesUpdateRequest(BaseModel):
    overrides: Dict[str, Optional[OverrideItem]] = Field(default_factory=dict)
