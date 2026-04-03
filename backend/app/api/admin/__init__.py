from fastapi import APIRouter

from .bootstrap_user_api import router as bootstrap_user_router
from .create_user_api import router as create_user_router
from .delete_user_api import router as delete_user_router
from .list_users_api import router as list_users_router
from .setup_status_api import router as setup_status_router
from .update_user_api import router as update_user_router


router = APIRouter()

router.include_router(bootstrap_user_router)
router.include_router(setup_status_router)
router.include_router(list_users_router)
router.include_router(create_user_router)
router.include_router(update_user_router)
router.include_router(delete_user_router)
