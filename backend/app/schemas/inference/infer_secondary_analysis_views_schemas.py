from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class InferSecondaryAnalysisViewsRequest(BaseModel):
    study_uid: str
    include_file_paths: Optional[List[str]] = None


class SecondaryAnalysisViewsResponse(BaseModel):
    study_uid: str
    num_instances: int
    updated_instances: int
    views: Dict[str, Dict[str, Any]]
