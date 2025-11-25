from fastapi import APIRouter, Response

from app.schemas.authentication.authentication_schemas import LogoutResponse
from app.core.artifacts import AUTH_COOKIE_NAME

router = APIRouter()


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