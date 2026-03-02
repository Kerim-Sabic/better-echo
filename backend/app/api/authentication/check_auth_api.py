from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import decode_token
from app.schemas.authentication.authentication_schemas import AuthResponse
from app.core.artifacts import AUTH_COOKIE_NAME

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
    # --- Step 1: Get token from cookies ---
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        # --- Step 2: Decode token and extract user id ---
        payload = decode_token(token)
        if not payload or "sub" not in payload:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(payload.get("sub"))

        # --- Step 3: Fetch user from database ---
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token or user not found")

        # --- Step 4: Return authenticated user ---
        return {
            "message": "Authentication successful",
            "user": {
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "full_name": user.full_name
            }
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

