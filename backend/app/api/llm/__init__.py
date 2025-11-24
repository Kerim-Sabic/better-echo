from fastapi import APIRouter

from .llm_report_generate_api import router as llm_report_generate_api
from .llm_chat_api import router as llm_chat_router

router = APIRouter()

router.include_router(llm_report_generate_api)
router.include_router(llm_chat_router)