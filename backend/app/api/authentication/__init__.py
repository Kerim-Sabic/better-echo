from fastapi import APIRouter

from .login_api import router as login_router
from .logout_api import router as logout_router
from .check_auth_api import router as check_auth_router
from .webauthn import router as webauthn_router


router = APIRouter()

router.include_router(login_router)
router.include_router(logout_router)
router.include_router(check_auth_router)
router.include_router(webauthn_router)
