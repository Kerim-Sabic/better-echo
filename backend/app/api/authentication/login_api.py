from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import (
    create_token,
    is_desktop_client_request,
    verify_password,
)
from app.core.config import settings
from app.schemas.authentication.authentication_schemas import LoginRequest, AuthResponse
from app.core.artifacts import AUTH_COOKIE_NAME
from app.services.auth.login_activity_service import mark_user_last_login
from app.services.inference.secondary_analysis_service import (
    start_secondary_analysis_preload_background,
)
from app.services.auth.principal_service import (
    USER_PRINCIPAL_TYPE,
    build_user_token_payload,
    build_vendor_token_payload,
    serialize_user_auth_principal,
)
from app.vendor_access.service import (
    VENDOR_ACCESS_PRINCIPAL_TYPE,
    authenticate_vendor_access,
    serialize_vendor_access_principal,
)

router = APIRouter(tags=["Authentication"])


@router.post("/login", response_model=AuthResponse)
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Validate credentials, issue a JWT in an HTTP-only cookie, and return user info.

    Steps:
    1. Look up the user by username and verify the submitted password against the stored hash.
    2. Build a token payload containing the user ID, username, role, and full name.
    3. Create a signed JWT with an expiration based on `TOKEN_EXPIRE_HOURS`.
    4. Set the JWT as an HTTP-only cookie on the response.
    5. Return a payload containing the basic user information.
    """
    # --- Step 1: Validate user credentials ---
    user = db.query(User).filter(User.username == data.username).first()
    principal_type = USER_PRINCIPAL_TYPE
    auth_principal = None

    if user:
        if not verify_password(data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token_payload = build_user_token_payload(user)
        auth_principal = serialize_user_auth_principal(user)
        mark_user_last_login(db, user)
        if settings.SECONDARY_ANALYSIS_WARMUP_ON_LOGIN:
            start_secondary_analysis_preload_background(warmup=True)
    else:
        vendor_profile = authenticate_vendor_access(
            username=data.username,
            password=data.password,
        )
        if vendor_profile is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        principal_type = VENDOR_ACCESS_PRINCIPAL_TYPE
        token_payload = build_vendor_token_payload(vendor_profile)
        auth_principal = serialize_vendor_access_principal(vendor_profile)

    # --- Step 3: Create JWT token ---
    auth_token_expires = timedelta(hours=settings.TOKEN_EXPIRE_HOURS)
    auth_token = create_token(token_payload, auth_token_expires)

    # --- Step 4: Set JWT auth token in HTTP-only cookie ---
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=auth_token,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )

    # --- Step 5: Return user info ---
    return {
        "message": "Login successful" if principal_type == USER_PRINCIPAL_TYPE else "Vendor access login successful",
        "user": auth_principal,
        "auth_token": auth_token if is_desktop_client_request(request) else None,
    }
