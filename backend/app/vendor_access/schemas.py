from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class VendorAccessStudyPatientInfo(BaseModel):
    patient_id: str | None = None
    patient_name: str | None = None


class VendorAccessStudyOwnerInfo(BaseModel):
    id: int | None = None
    username: str | None = None
    full_name: str | None = None


class VendorAccessStudyListItem(BaseModel):
    id: int
    study_uid: str
    study_date: str | None = None
    description: str | None = None
    status: str
    uploaded_at: datetime
    patient: VendorAccessStudyPatientInfo
    owner: VendorAccessStudyOwnerInfo


class VendorAccessStudiesPageResponse(BaseModel):
    items: list[VendorAccessStudyListItem]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class VendorAccessUserActivityItem(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    role: str
    last_login_at: datetime | None = None
    last_study_created_at: datetime | None = None


class VendorAccessUserActivityResponse(BaseModel):
    users: list[VendorAccessUserActivityItem]


class VendorAccessLogTailResponse(BaseModel):
    file_path: str
    updated_at: datetime | None = None
    lines: list[str]
