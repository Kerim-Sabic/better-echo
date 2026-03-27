from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.auth.authentication_functions import get_current_user_id
from app.helpers.http.request_access import require_loopback_request
from app.schemas.admin import ManagedUserDeleteResponse
from app.services.auth.user_admin_service import (
    MAX_SERVER_USERS,
    UserAdminAuthorizationError,
    UserAdminConflictError,
    UserAdminNotFoundError,
    count_users,
    delete_managed_user,
)

router = APIRouter(tags=["Admin"])


@router.delete("/admin/users/{user_id}", response_model=ManagedUserDeleteResponse)
def delete_admin_user(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    require_loopback_request(request)

    try:
        delete_managed_user(
            db,
            acting_user_id=current_user_id,
            target_user_id=user_id,
        )
    except UserAdminAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except UserAdminNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except UserAdminConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return ManagedUserDeleteResponse(
        message="User deleted successfully.",
        total_users=count_users(db),
        max_users=MAX_SERVER_USERS,
    )
