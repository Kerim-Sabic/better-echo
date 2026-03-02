from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.users import User
from app.helpers.auth.authentication_functions import verify_password, create_token
from app.core.config import settings
from app.schemas.authentication.authentication_schemas import LoginRequest, AuthResponse
from app.core.artifacts import AUTH_COOKIE_NAME

router = APIRouter(tags=["Authentication"])


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
