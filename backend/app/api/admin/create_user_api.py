from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.auth.authentication_functions import get_current_user_id
from app.helpers.http.request_access import require_loopback_request
from app.schemas.admin import ManagedUserMutationResponse, ManagedUserRequest
from app.services.auth.user_admin_service import (
    MAX_SERVER_USERS,
    UserAdminAuthorizationError,
    UserAdminConflictError,
    UserAdminValidationError,
    count_users,
    create_managed_user,
    serialize_managed_user,
)

router = APIRouter(tags=["Admin"])


@router.post(
    "/admin/users",
    response_model=ManagedUserMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_admin_user(
    request: Request,
    payload: ManagedUserRequest,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    require_loopback_request(request)

    try:
        managed_user = create_managed_user(
            db,
            acting_user_id=current_user_id,
            username=payload.username,
            password=payload.password,
            full_name=payload.full_name,
            role=payload.role,
        )
    except UserAdminAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except UserAdminConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except UserAdminValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ManagedUserMutationResponse(
        message="User created successfully.",
        user=serialize_managed_user(managed_user),
        total_users=count_users(db),
        max_users=MAX_SERVER_USERS,
    )
