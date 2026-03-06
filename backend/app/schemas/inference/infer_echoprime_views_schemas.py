from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class InferEchoPrimeViewsRequest(BaseModel):
    study_uid: str
    include_file_paths: Optional[List[str]] = None


class EchoPrimeViewsResponse(BaseModel):
    study_uid: str
    num_instances: int
    updated_instances: int
    views: Dict[str, Dict[str, Any]]
