import base64
import logging
from collections.abc import Mapping
from datetime import timedelta
from enum import Enum
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.artifacts import AUTH_COOKIE_NAME
from app.core.config import settings
from app.database.db import get_db
from app.database_models import User, WebAuthnCredential
from app.helpers.authentication_functions import create_token, get_current_user_id
from app.schemas.authentication.authentication_schemas import AuthResponse
from app.schemas.authentication.webauthn_schemas import (
    AuthCompleteRequest,
    AuthOptionsRequest,
    AuthOptionsResponse,
    RegisterCompleteRequest,
    RegisterCompleteResponse,
    RegisterOptionsResponse,
    RemoveCredentialResponse,
    WebAuthnStatusResponse,
)

from fido2 import cbor
from fido2.cose import CoseKey
from fido2.server import Fido2Server
from fido2.webauthn import (
    AttestedCredentialData,
    AuthenticatorAttachment,
    AuthenticatorData,
    PublicKeyCredentialDescriptor,
    PublicKeyCredentialRpEntity,
    PublicKeyCredentialUserEntity,
    UserVerificationRequirement,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Pending states keyed by user id (register) or username/"*" (auth)
_pending_register: Dict[int, Tuple] = {}
_pending_auth: Dict[str, Tuple] = {}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_to_bytes(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _origin_from_request(request: Request) -> str:
    origin = request.headers.get("origin")
    if origin:
        return origin
    scheme = request.url.scheme or "https"
    host = request.url.hostname or "localhost"
    port = request.url.port
    if port and port not in (80, 443):
        return f"{scheme}://{host}:{port}"
    return f"{scheme}://{host}"


def _rp_entity(request: Request) -> PublicKeyCredentialRpEntity:
    parsed = urlparse(_origin_from_request(request))
    host = parsed.hostname or "localhost"
    return PublicKeyCredentialRpEntity(id=host, name="Horalix")


def _server_for_request(request: Request) -> Fido2Server:
    origin = _origin_from_request(request)

    def verify_origin(candidate: str) -> bool:
        try:
            parsed = urlparse(candidate)
            base = f"{parsed.scheme}://{parsed.hostname}"
            return origin.startswith(base)
        except Exception:
            return False

    return Fido2Server(_rp_entity(request), verify_origin=verify_origin, attestation="none")


def _serialize_options(options) -> dict:
    data = getattr(options, "public_key", None) or options

    def enc(val):
        if isinstance(val, Enum):
            return val.value
        if isinstance(val, (bytes, bytearray, memoryview)):
            return _b64url(bytes(val))
        if isinstance(val, list):
            return [enc(v) for v in val]
        if isinstance(val, Mapping):
            return {k: enc(v) for k, v in val.items()}
        return val

    return enc(data)

def _load_credentials(user_id: Optional[int], db: Session) -> List[AttestedCredentialData]:
    query = db.query(WebAuthnCredential)
    if user_id is not None:
        query = query.filter(WebAuthnCredential.user_id == user_id)
    creds: List[AttestedCredentialData] = []
    for rec in query.all():
        try:
            cred_id = bytes(rec.credential_id) if rec.credential_id else None
            pub_key = bytes(rec.public_key) if rec.public_key else None
            aaguid = bytes(rec.aaguid) if rec.aaguid else b"\x00" * 16
            if not cred_id or not pub_key:
                logger.warning("Skipping credential for user %s due to missing id/public_key", rec.user_id)
                continue
            if len(aaguid) < 16:
                aaguid = aaguid.ljust(16, b"\x00")
            elif len(aaguid) > 16:
                aaguid = aaguid[:16]
            cose_key = CoseKey.parse(cbor.decode(pub_key))
            creds.append(AttestedCredentialData.create(aaguid, cred_id, cose_key))
        except Exception as exc:
            logger.warning("Failed to load credential for user %s: %s", rec.user_id, exc)
    logger.info("Loaded %s webauthn credentials for user=%s", len(creds), user_id if user_id is not None else "<any>")
    return creds


@router.get("/auth/webauthn/status", response_model=WebAuthnStatusResponse)
def get_webauthn_status(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    records = (
        db.query(WebAuthnCredential)
        .filter(WebAuthnCredential.user_id == current_user_id)
        .all()
    )
    credential_ids = [_b64url(bytes(rec.credential_id)) for rec in records if rec.credential_id]
    return WebAuthnStatusResponse(
        enrolled=bool(credential_ids),
        credential_count=len(credential_ids),
        credential_ids=credential_ids,
    )


@router.post("/auth/webauthn/options/register", response_model=RegisterOptionsResponse)
def get_register_options(
    request: Request,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")

    server = _server_for_request(request)
    existing = [
        PublicKeyCredentialDescriptor(id=rec.credential_id, type="public-key")
        for rec in db.query(WebAuthnCredential).filter(WebAuthnCredential.user_id == current_user_id).all()
        if rec.credential_id
    ]
    options, state = server.register_begin(
        PublicKeyCredentialUserEntity(
            id=str(user.id).encode("utf-8"),
            name=user.username,
            display_name=user.full_name or user.username,
        ),
        existing,
        user_verification=UserVerificationRequirement.REQUIRED,
        authenticator_attachment=AuthenticatorAttachment.PLATFORM,
    )
    _pending_register[current_user_id] = state
    return RegisterOptionsResponse(publicKey=_serialize_options(options))


@router.post("/auth/webauthn/register", response_model=RegisterCompleteResponse)
def complete_register(
    payload: RegisterCompleteRequest,
    request: Request,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    state = _pending_register.pop(current_user_id, None)
    if not state:
        raise HTTPException(status_code=400, detail="No pending registration")

    credential = payload.credential or {}
    server = _server_for_request(request)
    try:
        auth_data = server.register_complete(state, credential)
    except Exception as exc:
        logger.warning("WebAuthn registration failed for user_id=%s: %s", current_user_id, exc)
        raise HTTPException(status_code=400, detail=f"Registration failed: {exc}")

    credential_data = getattr(auth_data, "credential_data", None)
    if credential_data is None:
        raise HTTPException(status_code=400, detail="Registration failed: missing credential data")

    try:
        pubkey_bytes = cbor.encode(dict(credential_data.public_key))
    except Exception as exc:
        logger.warning("WebAuthn registration failed to encode public key for user_id=%s: %s", current_user_id, exc)
        raise HTTPException(status_code=400, detail="Registration failed: unable to encode public key")

    aaguid_bytes = bytes(getattr(credential_data, "aaguid", b"") or b"")
    if len(aaguid_bytes) < 16:
        aaguid_bytes = aaguid_bytes.ljust(16, b"\x00")
    elif len(aaguid_bytes) > 16:
        aaguid_bytes = aaguid_bytes[:16]

    sign_count = int(getattr(auth_data, "counter", 0) or 0)

    record = WebAuthnCredential(
        user_id=current_user_id,
        credential_id=credential_data.credential_id,
        public_key=pubkey_bytes,
        sign_count=sign_count,
        aaguid=aaguid_bytes,
    )
    db.add(record)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("WebAuthn registration failed to persist credential for user_id=%s: %s", current_user_id, exc)
        raise HTTPException(status_code=400, detail="Registration failed: unable to save credential")
    logger.info("WebAuthn register complete: stored credential for user_id=%s (pubkey_len=%s)", current_user_id, len(pubkey_bytes))

    return RegisterCompleteResponse(
        message="Biometric credential registered",
        credential_id=_b64url(credential_data.credential_id),
    )


@router.post("/auth/webauthn/options/authenticate", response_model=AuthOptionsResponse)
def get_auth_options(
    payload: AuthOptionsRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    username = (payload.username or "").strip()
    user = None
    if username:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

    creds = _load_credentials(user.id if user else None, db)
    if not creds:
        raise HTTPException(status_code=404, detail="No biometric credential available")

    server = _server_for_request(request)
    options, state = server.authenticate_begin(creds, user_verification=UserVerificationRequirement.REQUIRED)
    key = username or "*"
    _pending_auth[key] = (state, user.id if user else None)
    return AuthOptionsResponse(publicKey=_serialize_options(options))


@router.post("/auth/webauthn/authenticate", response_model=AuthResponse)
def complete_authenticate(
    payload: AuthCompleteRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    credential = payload.credential or {}
    raw_id_b64 = credential.get("rawId") or credential.get("id")
    if not raw_id_b64:
        raise HTTPException(status_code=400, detail="Missing credential id")
    credential_id = _b64url_to_bytes(raw_id_b64)

    key = (payload.username or "").strip() or "*"
    state_entry = _pending_auth.pop(key, None)
    if not state_entry:
        raise HTTPException(status_code=400, detail="No pending authentication")
    state, _user_hint = state_entry

    stored_cred = (
        db.query(WebAuthnCredential)
        .filter(WebAuthnCredential.credential_id == credential_id)
        .first()
    )
    if not stored_cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    user = db.query(User).filter(User.id == stored_cred.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not stored_cred.public_key:
        raise HTTPException(status_code=404, detail="Credential not found")

    aaguid = bytes(stored_cred.aaguid) if stored_cred.aaguid else b"\x00" * 16
    if len(aaguid) < 16:
        aaguid = aaguid.ljust(16, b"\x00")
    elif len(aaguid) > 16:
        aaguid = aaguid[:16]

    try:
        cose_key = CoseKey.parse(cbor.decode(bytes(stored_cred.public_key)))
        creds = [AttestedCredentialData.create(aaguid, bytes(stored_cred.credential_id), cose_key)]
    except Exception as exc:
        logger.warning("WebAuthn auth failed to load stored key for user_id=%s: %s", stored_cred.user_id, exc)
        raise HTTPException(status_code=400, detail="Credential is not usable")

    server = _server_for_request(request)
    try:
        server.authenticate_complete(state, creds, credential)
    except Exception as exc:
        logger.warning("WebAuthn authentication failed for user_id=%s: %s", user.id, exc)
        raise HTTPException(status_code=400, detail=f"Authentication failed: {exc}")

    try:
        auth_data_b64 = credential.get("response", {}).get("authenticatorData")
        if auth_data_b64:
            counter = AuthenticatorData(_b64url_to_bytes(auth_data_b64)).counter
            stored_cred.sign_count = int(counter)
            db.commit()
    except Exception:
        pass

    token_payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
    }
    auth_token_expires = timedelta(hours=settings.TOKEN_EXPIRE_HOURS)
    auth_token = create_token(token_payload, auth_token_expires)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=auth_token,
        httponly=True,
        samesite="lax",
        secure=False,
    )

    return {
        "message": "Authentication successful",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name,
        },
    }


@router.delete("/auth/webauthn/credentials/{credential_id}", response_model=RemoveCredentialResponse)
def delete_credential(
    credential_id: str,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    try:
        credential_id_bytes = _b64url_to_bytes(credential_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid credential id")

    record = (
        db.query(WebAuthnCredential)
        .filter(
            WebAuthnCredential.user_id == current_user_id,
            WebAuthnCredential.credential_id == credential_id_bytes,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Credential not found")

    db.delete(record)
    db.commit()
    logger.info("Removed WebAuthn credential for user_id=%s", current_user_id)
    return RemoveCredentialResponse(message="Credential removed", removed=True)
