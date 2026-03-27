from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.http.request_access import require_loopback_request
from app.schemas.admin import BootstrapAdminRequest, BootstrapAdminResponse
from app.services.auth.user_admin_service import (
    UserAdminConflictError,
    UserAdminValidationError,
    bootstrap_admin_user,
)

router = APIRouter(tags=["Admin"])


@router.post(
    "/admin/bootstrap-user",
    response_model=BootstrapAdminResponse,
    status_code=status.HTTP_201_CREATED,
)
def bootstrap_first_admin(
    request: Request,
    payload: BootstrapAdminRequest,
    db: Session = Depends(get_db),
):
    """Create the first server admin before any other user exists."""
    require_loopback_request(request)

    try:
        admin_user = bootstrap_admin_user(
            db,
            username=payload.username,
            password=payload.password,
            full_name=payload.full_name,
        )
    except UserAdminValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UserAdminConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return BootstrapAdminResponse(
        message="Bootstrap admin created successfully.",
        user={
            "id": admin_user.id,
            "username": admin_user.username,
            "role": admin_user.role,
            "full_name": admin_user.full_name,
        },
    )
