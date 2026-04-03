from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.helpers.http.request_access import require_loopback_request
from app.schemas.admin import AdminSetupStatusResponse
from app.services.auth.user_admin_service import get_admin_setup_status

router = APIRouter(tags=["Admin"])


@router.get("/admin/setup-status", response_model=AdminSetupStatusResponse)
def get_admin_setup_status_route(
    request: Request,
    db: Session = Depends(get_db),
):
    require_loopback_request(request)
    return AdminSetupStatusResponse(**get_admin_setup_status(db))
