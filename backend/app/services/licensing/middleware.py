from fastapi import Request
from starlette.responses import JSONResponse

from app.core.config import settings
from app.helpers.auth.authentication_functions import (
    VENDOR_PRINCIPAL_TYPE,
    decode_token,
    get_auth_token_from_request,
)
from app.services.auth.principal_service import auth_payload_principal_type
from app.services.licensing.service import (
    get_license_status,
    is_license_exempt_path,
    is_license_read_only_allowed_path,
)


def _is_vendor_bypass_request(request: Request) -> bool:
    auth_token = get_auth_token_from_request(request)
    if not auth_token:
        return False

    payload = decode_token(auth_token)
    if not isinstance(payload, dict):
        return False

    return auth_payload_principal_type(payload) == VENDOR_PRINCIPAL_TYPE


async def enforce_license_middleware(request: Request, call_next):
    if not settings.LICENSE_ENFORCEMENT or is_license_exempt_path(request.url.path):
        return await call_next(request)
    if _is_vendor_bypass_request(request):
        return await call_next(request)

    status = get_license_status()
    if status["valid"]:
        return await call_next(request)
    if (
        status.get("status") == "expired"
        and is_license_read_only_allowed_path(request.url.path, request.method)
    ):
        return await call_next(request)

    return JSONResponse(
        status_code=403,
        content={
            "detail": "Server license is invalid or missing.",
            "license": status,
        },
    )
