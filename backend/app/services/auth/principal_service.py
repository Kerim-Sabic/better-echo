from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import get_current_auth_payload
from app.vendor_access.service import (
    VENDOR_ACCESS_PRINCIPAL_TYPE,
    build_vendor_access_token_payload,
    resolve_vendor_access_principal,
)


USER_PRINCIPAL_TYPE = "user"
DOCTOR_ROLE = "doctor"
ADMIN_ROLE = "admin"


def auth_payload_principal_type(payload: dict[str, object]) -> str:
    if payload.get("principal_type") == VENDOR_ACCESS_PRINCIPAL_TYPE:
        return VENDOR_ACCESS_PRINCIPAL_TYPE
    return USER_PRINCIPAL_TYPE


def is_vendor_principal(principal: dict[str, object]) -> bool:
    return auth_payload_principal_type(principal) == VENDOR_ACCESS_PRINCIPAL_TYPE


def is_user_principal(principal: dict[str, object]) -> bool:
    return auth_payload_principal_type(principal) == USER_PRINCIPAL_TYPE


def is_doctor_user_principal(principal: dict[str, object]) -> bool:
    return is_user_principal(principal) and principal.get("role") == DOCTOR_ROLE


def is_admin_user_principal(principal: dict[str, object]) -> bool:
    return is_user_principal(principal) and principal.get("role") == ADMIN_ROLE


def serialize_user_auth_principal(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name or "",
        "principal_type": USER_PRINCIPAL_TYPE,
    }


def build_user_token_payload(user: User) -> dict[str, str]:
    return {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name or "",
        "principal_type": USER_PRINCIPAL_TYPE,
    }


def build_vendor_token_payload(profile) -> dict[str, str]:
    return build_vendor_access_token_payload(profile)


def resolve_auth_principal_from_payload(
    db: Session,
    payload: dict[str, object],
) -> dict[str, object] | None:
    principal_type = auth_payload_principal_type(payload)

    if principal_type == VENDOR_ACCESS_PRINCIPAL_TYPE:
        return resolve_vendor_access_principal(payload)

    user_id = payload.get("sub")
    if not user_id:
        return None

    try:
        normalized_user_id = int(user_id)
    except (TypeError, ValueError):
        return None

    user = db.query(User).filter(User.id == normalized_user_id).first()
    if not user:
        return None

    return serialize_user_auth_principal(user)


def get_current_auth_principal(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    payload = get_current_auth_payload(request)
    principal = resolve_auth_principal_from_payload(db, payload)
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token or principal not found",
        )
    return principal


def get_current_doctor_user_id(
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
) -> int:
    if not is_doctor_user_principal(current_principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor access is required.",
        )

    principal_id = current_principal.get("id")
    if principal_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token or principal not found",
        )

    return int(principal_id)


def get_current_study_read_principal(
    current_principal: dict[str, object] = Depends(get_current_auth_principal),
) -> dict[str, object]:
    if is_vendor_principal(current_principal) or is_doctor_user_principal(current_principal):
        return current_principal

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Study access is restricted to doctors and vendor access.",
    )
