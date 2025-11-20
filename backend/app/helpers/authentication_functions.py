from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Request

from app.core.config import settings

"""
THIS FILE PROVIDES FUNCTIONS FOR AUTHENTICATION
"""

# --- Password hashing context --------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Secret & Algorithm
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"

# --- Hash password -------------------------------------------------
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

# --- Verify password -----------------------------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
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
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        print("JWT decode error: ", e)
        return None
    
# --- Extract user from JWT stored in HTTP-only cookie ----------------
def get_current_user_id(request: Request) -> int:
    # Part 1. Read cookie containing JWT
    auth_token = request.cookies.get("auth_token")

    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    # Part 2. Decode token
    payload = decode_token(auth_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired",
        )
    
    # Part 3. Take the user_id from the payload
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing 'sub' (user ID)",
        )
    
    return int(user_id)
