from datetime import datetime, timedelta, timezone
import logging
from typing import Optional, Dict, Any

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Request

from app.core.config import settings
from app.core.artifacts import AUTH_COOKIE_NAME


logger = logging.getLogger(__name__)
USER_PRINCIPAL_TYPE = "user"
VENDOR_PRINCIPAL_TYPE = "vendor"

# --- Password hashing context --------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Secret & Algorithm
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
DESKTOP_CLIENT_HEADER = "x-horalix-desktop-client"

# --- Hash password -------------------------------------------------
def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return pwd_context.hash(password)

# --- Verify password -----------------------------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its hashed value."""
    return pwd_context.verify(plain_password, hashed_password)

# --- Create JWT token -----------------------------------------------
def create_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": int(expire.timestamp())})  # numeric timestamp
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Decode JWT token -----------------------------------------------
def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
        return None

def is_desktop_client_request(request: Request) -> bool:
    return request.headers.get(DESKTOP_CLIENT_HEADER, "").strip() == "1"

def get_auth_token_from_request(request: Request) -> Optional[str]:
    auth_header = request.headers.get("authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        bearer_token = auth_header[7:].strip()
        if bearer_token:
            return bearer_token

    return request.cookies.get(AUTH_COOKIE_NAME)

def get_current_auth_payload(request: Request) -> Dict[str, Any]:
    # Part 1. Read auth token from explicit desktop bearer header or fallback cookie.
    auth_token = get_auth_token_from_request(request)
    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    # Part 2. Decode token.
    payload = decode_token(auth_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired",
        )

    return payload

# --- Extract user from JWT stored in HTTP-only cookie or desktop auth header --
def get_current_user_id(request: Request) -> int:
    # Part 1. Resolve the auth payload from the incoming request.
    payload = get_current_auth_payload(request)
    principal_type = payload.get("principal_type") or USER_PRINCIPAL_TYPE

    if principal_type == VENDOR_PRINCIPAL_TYPE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )

    # Part 2. Take the user_id from the payload.
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing 'sub' (user ID)",
        )

    return int(user_id)
