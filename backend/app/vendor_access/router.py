from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.database.db import get_db
from app.schemas.admin import (
    ManagedUserDeleteResponse,
    ManagedUserMutationResponse,
    ManagedUserRequest,
    ManagedUserUpdateRequest,
)
from app.services.auth.user_admin_service import (
    UserAdminConflictError,
    UserAdminNotFoundError,
    UserAdminValidationError,
)
from app.services.auth.principal_service import get_current_auth_principal
from app.vendor_access.schemas import (
    VendorAccessLogTailResponse,
    VendorAccessStudiesPageResponse,
    VendorAccessUserActivityResponse,
)
from app.vendor_access.service import (
    DEFAULT_VENDOR_LOG_TAIL_LINES,
    DEFAULT_VENDOR_STUDIES_PAGE_SIZE,
    build_vendor_access_studies_export,
    create_vendor_access_user,
    delete_vendor_access_user,
    get_vendor_access_log_download_path,
    list_vendor_access_studies,
    list_vendor_access_user_activity,
    read_vendor_access_log_tail,
    require_vendor_access_principal,
    update_vendor_access_user,
)


router = APIRouter(tags=["Vendor Access"])


@router.get("/vendor-access/studies", response_model=VendorAccessStudiesPageResponse)
def get_vendor_access_studies(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_VENDOR_STUDIES_PAGE_SIZE, ge=1),
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
):
    require_vendor_access_principal(current_principal)
    return list_vendor_access_studies(db, page=page, page_size=page_size)


@router.get("/vendor-access/users/activity", response_model=VendorAccessUserActivityResponse)
def get_vendor_access_user_activity(
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
):
    require_vendor_access_principal(current_principal)
    return {"users": list_vendor_access_user_activity(db)}


@router.get("/vendor-access/logs/tail", response_model=VendorAccessLogTailResponse)
def get_vendor_access_log_tail(
    lines: int = Query(DEFAULT_VENDOR_LOG_TAIL_LINES, ge=1),
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
):
    require_vendor_access_principal(current_principal)
    return read_vendor_access_log_tail(lines=lines)


@router.get("/vendor-access/logs/download")
def download_vendor_access_log(
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
):
    require_vendor_access_principal(current_principal)
    log_file_path = get_vendor_access_log_download_path()
    return FileResponse(
        path=log_file_path,
        media_type="text/plain; charset=utf-8",
        filename=log_file_path.name,
    )


def _cleanup_export_file(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass


@router.get("/vendor-access/exports/studies")
def download_vendor_access_studies_export(
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
):
    require_vendor_access_principal(current_principal)
    archive_path, file_name = build_vendor_access_studies_export(db)
    return FileResponse(
        path=archive_path,
        media_type="application/zip",
        filename=file_name,
        background=BackgroundTask(_cleanup_export_file, archive_path),
    )


@router.post("/vendor-access/users", response_model=ManagedUserMutationResponse)
def create_vendor_access_managed_user(
    payload: ManagedUserRequest,
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
):
    require_vendor_access_principal(current_principal)
    try:
        return create_vendor_access_user(
            db,
            username=payload.username,
            password=payload.password,
            full_name=payload.full_name,
            role=payload.role,
        )
    except UserAdminConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except UserAdminValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/vendor-access/users/{user_id}", response_model=ManagedUserMutationResponse)
def update_vendor_access_managed_user(
    user_id: int,
    payload: ManagedUserUpdateRequest,
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
):
    require_vendor_access_principal(current_principal)
    try:
        return update_vendor_access_user(
            db,
            user_id=user_id,
            username=payload.username,
            full_name=payload.full_name,
            role=payload.role,
            password=payload.password,
        )
    except UserAdminNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except UserAdminConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except UserAdminValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/vendor-access/users/{user_id}", response_model=ManagedUserDeleteResponse)
def delete_vendor_access_managed_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
):
    require_vendor_access_principal(current_principal)
    try:
        return delete_vendor_access_user(db, user_id=user_id)
    except UserAdminNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
