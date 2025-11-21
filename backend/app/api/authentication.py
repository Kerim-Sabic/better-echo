from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.users import User
from app.helpers.authentication_functions import verify_password, create_token, decode_token
from app.core.config import settings
from app.schemas.authentication_schemas import LoginRequest, AuthResponse, LogoutResponse


router = APIRouter()
AUTH_COOKIE_NAME = "auth_token"

@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
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
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # --- Step 2: Build token payload ---
    token_payload = {"sub": str(user.id), "username": user.username, "role": user.role, "full_name": user.full_name}

    # --- Step 3: Create JWT token ---
    auth_token_expires = timedelta(hours=settings.TOKEN_EXPIRE_HOURS)
    auth_token = create_token(token_payload, auth_token_expires)

    # --- Step 4: Set JWT auth token in HTTP-only cookie ---
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=auth_token,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True when served over HTTPS in production
    )

    # --- Step 5: Return user info ---
    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name
        }
    }


@router.post("/logout", response_model=LogoutResponse)
def logout(response: Response):
    """
    Clear the auth cookie to log the user out.

    Steps:
    1. Delete the auth cookie (`AUTH_COOKIE_NAME`) from the response.
    2. Return a confirmation message indicating logout succeeded.
    """
    # --- Step 1: Delete the cookie with the JWT auth token ---
    response.delete_cookie(key=AUTH_COOKIE_NAME)
    
    # --- Step 2: Return confirmation ---
    return {"message": "Logged out successfully"}


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
