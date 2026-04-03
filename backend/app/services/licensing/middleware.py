from fastapi import Request
from starlette.responses import JSONResponse

from app.core.config import settings
from app.services.licensing.service import get_license_status, is_license_exempt_path


async def enforce_license_middleware(request: Request, call_next):
    if not settings.LICENSE_ENFORCEMENT or is_license_exempt_path(request.url.path):
        return await call_next(request)

    status = get_license_status()
    if status["valid"]:
        return await call_next(request)

    return JSONResponse(
        status_code=403,
        content={
            "detail": "Server license is invalid or missing.",
            "license": status,
        },
    )
