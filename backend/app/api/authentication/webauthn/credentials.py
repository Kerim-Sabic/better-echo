import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from fido2 import cbor
from fido2.cose import CoseKey
from fido2.webauthn import AttestedCredentialData

from app.database_models import WebAuthnCredential


logger = logging.getLogger(__name__)

"""
Credential persistence helpers for WebAuthn.

We store WebAuthn public keys as CBOR-encoded COSE key dicts (bytes) so they can be
reconstructed into `CoseKey` objects during authentication.
"""

def load_credentials(user_id: Optional[int], db: Session) -> List[AttestedCredentialData]:
    """Load stored credentials and convert them into AttestedCredentialData for FIDO2."""
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


def attested_credential_from_record(record: WebAuthnCredential) -> AttestedCredentialData:
    """Convert a DB WebAuthnCredential row into AttestedCredentialData."""
    if not record.credential_id or not record.public_key:
        raise ValueError("Missing credential data")

    aaguid = bytes(record.aaguid) if record.aaguid else b"\x00" * 16
    if len(aaguid) < 16:
        aaguid = aaguid.ljust(16, b"\x00")
    elif len(aaguid) > 16:
        aaguid = aaguid[:16]

    cose_key = CoseKey.parse(cbor.decode(bytes(record.public_key)))
    return AttestedCredentialData.create(aaguid, bytes(record.credential_id), cose_key)
