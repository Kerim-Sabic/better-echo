from fastapi import APIRouter, HTTPException, Request

from app.helpers.http.request_access import require_loopback_request
from app.schemas.licensing.licensing_schemas import (
    ActivationRequestResponse,
    LicenseImportRequest,
    LicenseStatusResponse,
)
from app.services.licensing.service import (
    build_activation_request,
    get_license_status,
    import_signed_license,
)

router = APIRouter(tags=["Licensing"])


@router.get("/licensing/status", response_model=LicenseStatusResponse)
def get_server_license_status(request: Request):
    require_loopback_request(request)
    return LicenseStatusResponse(**get_license_status())


@router.get("/licensing/activation-request", response_model=ActivationRequestResponse)
def export_activation_request(request: Request):
    require_loopback_request(request)
    return ActivationRequestResponse(**build_activation_request())


@router.post("/licensing/import", response_model=LicenseStatusResponse)
def import_server_license(
    request: Request,
    payload: LicenseImportRequest,
):
    require_loopback_request(request)
    try:
        return LicenseStatusResponse(
            **import_signed_license(
                {
                    "payload": payload.license,
                    "signature": payload.signature,
                }
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
