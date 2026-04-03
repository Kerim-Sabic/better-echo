from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.auth.authentication_functions import get_current_user_id
from app.helpers.http.request_access import require_loopback_request
from app.schemas.admin import ManagedUsersListResponse
from app.services.auth.user_admin_service import (
    MAX_SERVER_USERS,
    UserAdminAuthorizationError,
    list_managed_users,
    serialize_managed_user,
)

router = APIRouter(tags=["Admin"])


@router.get("/admin/users", response_model=ManagedUsersListResponse)
def list_admin_users(
    request: Request,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    require_loopback_request(request)

    try:
        users = list_managed_users(db, acting_user_id=current_user_id)
    except UserAdminAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    return ManagedUsersListResponse(
        users=[serialize_managed_user(user) for user in users],
        total_users=len(users),
        max_users=MAX_SERVER_USERS,
    )
