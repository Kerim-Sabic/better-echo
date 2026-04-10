from pydantic import BaseModel
from typing import Optional

class LoginRequest(BaseModel):
    username: str
    password: str

# --- Together used for the AuthResponse ---
class AuthPrincipalInfo(BaseModel):
    id: int | None = None
    username: str
    role: str
    full_name: str
    principal_type: str

class AuthResponse(BaseModel): # Used for both login and check-auth routes
    message: str
    user: AuthPrincipalInfo
    auth_token: Optional[str] = None
# ------------------------------------------

class LogoutResponse(BaseModel):
    message: str
