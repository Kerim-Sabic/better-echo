from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.users import User
from app.helpers.authentication_functions import verify_password, create_token, decode_token
from app.core.config import settings
from app.schemas.authentication_schemas import LoginRequest, AuthResponse, LogoutResponse


router = APIRouter()

@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
        Login route, in the database it is checked whether the user exists and if the
        id and password match, if yes, then a JWT cookie with user data is created
    """
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create Payload for Tokens (this is payload before adding the "exp" key)
    token_payload = {"sub": str(user.id), "username": user.username, "role": user.role, "full_name": user.full_name}

    # Create JWT Token
    auth_token_expires = timedelta(hours=settings.TOKEN_EXPIRE_HOURS)
    auth_token = create_token(token_payload, auth_token_expires)

    # Set JWT Auth Token in HTTP-only cookie
    response.set_cookie(
        key="auth_token",
        value=auth_token,
        httponly=True,
        samesite="lax",
        secure=False # Set to True if using HTTPS
    )

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
        Logout route, the auth_token cookie, where the JWT token is stored gets deleted
    """
    # Deletes the cookie with the JWT auth token
    response.delete_cookie(key="auth_token")
    
    return {"message": "Logged out sucessfully"}


@router.get("/check-auth", response_model=AuthResponse)
def check_auth(request: Request, db: Session = Depends(get_db)):
    """
        Check-auth route, used to check if the user is logged in 
        The user is logged in if the auth_token is present
    """
    # Get token from cookies
    token = request.cookies.get("auth_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        payload = decode_token(token) # Decodes JWT
        user_id = int(payload.get("sub")) # Takes the user id from the payload and converts it into int
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token or user not found")
        return {
            "message": "Authentication sucessful",
            "user": {
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "full_name": user.full_name
            }
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")