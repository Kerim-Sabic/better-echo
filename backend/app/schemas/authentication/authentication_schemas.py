from pydantic import BaseModel
from typing import Optional

class LoginRequest(BaseModel):
    username: str
    password: str

# --- Together used for the AuthResponse ---
class UserInfo(BaseModel):
    id: int
    username: str
    role: str
    full_name: str

class AuthResponse(BaseModel): # Used for both login and check-auth routes
    message: str
    user: UserInfo
    auth_token: Optional[str] = None
# ------------------------------------------

class LogoutResponse(BaseModel):
    message: str
