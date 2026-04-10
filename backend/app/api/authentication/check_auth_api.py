from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.services.auth.principal_service import resolve_auth_principal_from_payload
from app.helpers.auth.authentication_functions import get_current_auth_payload
from app.schemas.authentication.authentication_schemas import AuthResponse

router = APIRouter(tags=["Authentication"])

@router.get("/check-auth", response_model=AuthResponse)
def check_auth(request: Request, db: Session = Depends(get_db)):
    """
    Validate the auth cookie and return the current user if authenticated.

    Steps:
    1. Read the auth token from the request cookies; return 401 if missing.
    2. Decode the JWT payload; if invalid or missing a `sub` claim, return 401.
    3. Look up the user by ID from the payload; return 401 if no user is found.
    4. Return a payload containing a success message and basic user information.
    """
    # --- Step 1: Resolve token payload from desktop bearer header or cookie ---
    payload = get_current_auth_payload(request)
    if "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    # --- Step 2: Resolve current principal from payload ---
    principal = resolve_auth_principal_from_payload(db, payload)
    if principal is None:
        raise HTTPException(status_code=401, detail="Invalid token or user not found")

    # --- Step 3: Return authenticated user ---
    return {
        "message": "Authentication successful",
        "user": principal,
    }

