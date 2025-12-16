from urllib.parse import urlparse

from fastapi import Request
from fido2.server import Fido2Server
from fido2.webauthn import PublicKeyCredentialRpEntity

"""
FIDO2 server factory for the WebAuthn routes.

We derive the RP ID from the request origin host so dev mode works on localhost without
hardcoding environment-specific values.
"""

def origin_from_request(request: Request) -> str:
    """Best-effort origin resolution for browsers/Electron."""
    origin = request.headers.get("origin")
    if origin:
        return origin
    scheme = request.url.scheme or "https"
    host = request.url.hostname or "localhost"
    port = request.url.port
    if port and port not in (80, 443):
        return f"{scheme}://{host}:{port}"
    return f"{scheme}://{host}"


def rp_entity(request: Request) -> PublicKeyCredentialRpEntity:
    """Create RP metadata (id=name of origin host)."""
    parsed = urlparse(origin_from_request(request))
    host = parsed.hostname or "localhost"
    return PublicKeyCredentialRpEntity(id=host, name="Horalix")


def server_for_request(request: Request) -> Fido2Server:
    """Create a Fido2Server with origin verification bound to the current request."""
    origin = origin_from_request(request)

    def verify_origin(candidate: str) -> bool:
        try:
            parsed = urlparse(candidate)
            base = f"{parsed.scheme}://{parsed.hostname}"
            return origin.startswith(base)
        except Exception:
            return False

    return Fido2Server(rp_entity(request), verify_origin=verify_origin, attestation="none")
