from typing import Any, Optional

from pydantic import BaseModel, Field


class LicenseStatusResponse(BaseModel):
    status: str
    valid: bool
    detail: Optional[str] = None
    license_id: Optional[str] = None
    customer_name: Optional[str] = None
    expires_at: Optional[str] = None
    features: list[str] = Field(default_factory=list)


class ActivationRequestResponse(BaseModel):
    generated_at: str
    machine_fingerprint: str
    hostname: str
    platform: str
    platform_release: str
    machine: str


class LicenseImportRequest(BaseModel):
    license: dict[str, Any]
    signature: str
