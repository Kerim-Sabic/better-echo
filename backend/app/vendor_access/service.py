from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from math import ceil
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.runtime_paths import logs_dir
from app.database_models.derived_results import DerivedResult
from app.database_models.series import Series
from app.database_models.studies import Study
from app.database_models.users import User
from app.helpers.auth.authentication_functions import verify_password
from app.helpers.pipeline.study_status import compute_study_status, is_llm_enabled, status_by_type
from app.services.auth.user_admin_service import (
    MAX_SERVER_USERS,
    count_users,
    create_managed_user_record,
    delete_managed_user_record,
    serialize_managed_user,
    update_managed_user_record,
)


logger = logging.getLogger(__name__)

VENDOR_ACCESS_ROLE = "vendor_access"
VENDOR_ACCESS_PRINCIPAL_TYPE = "vendor"
DEFAULT_VENDOR_LOG_TAIL_LINES = 200
MAX_VENDOR_LOG_TAIL_LINES = 1000
DEFAULT_VENDOR_STUDIES_PAGE_SIZE = 5
MAX_VENDOR_STUDIES_PAGE_SIZE = 100
TAIL_READ_CHUNK_SIZE_BYTES = 8192


@dataclass(frozen=True)
class VendorAccessProfile:
    username: str
    display_name: str
    password_hash: str


def is_release_runtime() -> bool:
    return os.environ.get("HORALIX_RELEASE_MODE") == "1"


def get_vendor_access_profile() -> VendorAccessProfile | None:
    if not is_release_runtime() or not settings.VENDOR_ACCESS_ENABLED:
        return None

    username = (settings.VENDOR_ACCESS_USERNAME or "").strip()
    display_name = (settings.VENDOR_ACCESS_DISPLAY_NAME or "").strip()
    password_hash = (settings.VENDOR_ACCESS_PASSWORD_HASH or "").strip()
    if not username or not display_name or not password_hash:
        logger.warning("Vendor access is enabled but embedded credentials are incomplete.")
        return None

    return VendorAccessProfile(
        username=username,
        display_name=display_name,
        password_hash=password_hash,
    )


def authenticate_vendor_access(*, username: str, password: str) -> VendorAccessProfile | None:
    profile = get_vendor_access_profile()
    if profile is None:
        return None

    if username.strip() != profile.username:
        return None

    if not verify_password(password, profile.password_hash):
        return None

    return profile


def serialize_vendor_access_principal(profile: VendorAccessProfile) -> dict[str, object]:
    return {
        "id": None,
        "username": profile.username,
        "role": VENDOR_ACCESS_ROLE,
        "full_name": profile.display_name,
        "principal_type": VENDOR_ACCESS_PRINCIPAL_TYPE,
    }


def build_vendor_access_token_payload(profile: VendorAccessProfile) -> dict[str, str]:
    return {
        "sub": f"vendor:{profile.username}",
        "username": profile.username,
        "role": VENDOR_ACCESS_ROLE,
        "full_name": profile.display_name,
        "principal_type": VENDOR_ACCESS_PRINCIPAL_TYPE,
    }


def resolve_vendor_access_principal(payload: dict[str, object]) -> dict[str, object] | None:
    profile = get_vendor_access_profile()
    if profile is None:
        return None

    payload_username = str(payload.get("username") or "").strip()
    if payload_username != profile.username:
        return None

    return serialize_vendor_access_principal(profile)


def require_vendor_access_principal(current_principal: dict[str, object]) -> dict[str, object]:
    if current_principal.get("principal_type") != VENDOR_ACCESS_PRINCIPAL_TYPE:
        raise HTTPException(status_code=404, detail="Not found")
    return current_principal


def _sanitize_path_component(value: object, *, fallback: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return fallback

    sanitized = re.sub(r'[<>:"/\\\\|?*]+', "_", normalized)
    sanitized = re.sub(r"\s+", " ", sanitized).strip(" .")
    return sanitized[:120] or fallback


def _json_default(value: object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _resolve_vendor_access_log_file() -> Path:
    return logs_dir() / "horalix.log"


def _tail_text_lines(file_path: Path, *, max_lines: int) -> list[str]:
    with file_path.open("rb") as log_handle:
        log_handle.seek(0, os.SEEK_END)
        cursor = log_handle.tell()
        buffer = bytearray()

        while cursor > 0 and buffer.count(b"\n") <= max_lines:
            read_size = min(TAIL_READ_CHUNK_SIZE_BYTES, cursor)
            cursor -= read_size
            log_handle.seek(cursor)
            chunk = log_handle.read(read_size)
            buffer[:0] = chunk

    decoded = buffer.decode("utf-8", errors="replace")
    return decoded.splitlines()[-max_lines:]


def _study_export_metadata(study: Study, *, effective_status: str) -> dict[str, object]:
    return {
        "study": {
            "id": study.id,
            "study_uid": study.study_uid,
            "study_date": study.study_date,
            "description": study.description,
            "status": effective_status,
            "uploaded_at": study.uploaded_at,
        },
        "patient": {
            "id": study.patient.id if study.patient else None,
            "patient_id": study.patient.patient_id if study.patient else None,
            "patient_name": study.patient.patient_name if study.patient else None,
            "patient_sex": study.patient.patient_sex if study.patient else None,
            "patient_birth_date": study.patient.patient_birth_date if study.patient else None,
        },
        "owner": {
            "id": study.user.id if study.user else None,
            "username": study.user.username if study.user else None,
            "full_name": study.user.full_name if study.user else None,
        },
        "series_count": len(study.series or []),
        "instance_count": sum(len(series.instances or []) for series in study.series or []),
        "derived_result_count": len(study.derived_results or []),
    }


def _derived_result_export_payload(row: DerivedResult) -> dict[str, object]:
    return {
        "id": row.id,
        "type": row.type,
        "status": row.status.value if row.status else None,
        "model_name": row.model_name,
        "model_version": row.model_version,
        "created_at": row.created_at,
        "study_id": row.study_id,
        "instance_id": row.instance_id,
        "artifact_set_id": row.artifact_set_id,
        "value_json": row.value_json,
    }


def list_vendor_access_studies(
    db: Session,
    *,
    page: int,
    page_size: int,
) -> dict[str, object]:
    normalized_page = max(page, 1)
    normalized_page_size = min(max(page_size, 1), MAX_VENDOR_STUDIES_PAGE_SIZE)
    offset = (normalized_page - 1) * normalized_page_size

    total_items = int(db.query(func.count(Study.id)).scalar() or 0)
    rows = (
        db.query(Study)
        .options(
            joinedload(Study.patient),
            joinedload(Study.user),
            joinedload(Study.derived_results),
        )
        .order_by(Study.uploaded_at.desc(), Study.id.desc())
        .offset(offset)
        .limit(normalized_page_size)
        .all()
    )

    llm_enabled = is_llm_enabled()
    items: list[dict[str, object]] = []
    for study in rows:
        derived_statuses = status_by_type(study.derived_results or [])
        effective_status = compute_study_status(llm_enabled, derived_statuses)
        items.append(
            {
                "id": study.id,
                "study_uid": study.study_uid,
                "study_date": study.study_date,
                "description": study.description,
                "status": effective_status,
                "uploaded_at": study.uploaded_at,
                "patient": {
                    "patient_id": study.patient.patient_id if study.patient else None,
                    "patient_name": study.patient.patient_name if study.patient else None,
                },
                "owner": {
                    "id": study.user.id if study.user else None,
                    "username": study.user.username if study.user else None,
                    "full_name": study.user.full_name if study.user else None,
                },
            }
        )

    total_pages = ceil(total_items / normalized_page_size) if normalized_page_size else 0
    return {
        "items": items,
        "page": normalized_page,
        "page_size": normalized_page_size,
        "total_items": total_items,
        "total_pages": total_pages,
    }


def list_vendor_access_user_activity(db: Session) -> list[dict[str, object]]:
    last_study_subquery = (
        db.query(
            Study.user_id.label("user_id"),
            func.max(Study.uploaded_at).label("last_study_created_at"),
        )
        .group_by(Study.user_id)
        .subquery()
    )

    rows = (
        db.query(
            User,
            last_study_subquery.c.last_study_created_at,
        )
        .outerjoin(last_study_subquery, last_study_subquery.c.user_id == User.id)
        .order_by(User.created_at.asc(), User.id.asc())
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "last_login_at": user.last_login_at,
            "last_study_created_at": last_study_created_at,
        }
        for user, last_study_created_at in rows
    ]


def create_vendor_access_user(
    db: Session,
    *,
    username: str,
    password: str,
    full_name: str,
    role: str,
) -> dict[str, object]:
    managed_user = create_managed_user_record(
        db,
        username=username,
        password=password,
        full_name=full_name,
        role=role,
    )
    return {
        "message": "User created successfully.",
        "user": serialize_managed_user(managed_user),
        "total_users": count_users(db),
        "max_users": MAX_SERVER_USERS,
    }


def update_vendor_access_user(
    db: Session,
    *,
    user_id: int,
    username: str,
    full_name: str,
    role: str,
    password: str | None = None,
) -> dict[str, object]:
    managed_user = update_managed_user_record(
        db,
        target_user_id=user_id,
        username=username,
        full_name=full_name,
        role=role,
        password=password,
        protect_last_admin=False,
    )
    return {
        "message": "User updated successfully.",
        "user": serialize_managed_user(managed_user),
        "total_users": count_users(db),
        "max_users": MAX_SERVER_USERS,
    }


def delete_vendor_access_user(
    db: Session,
    *,
    user_id: int,
) -> dict[str, object]:
    delete_managed_user_record(
        db,
        target_user_id=user_id,
        protect_last_admin=False,
    )
    return {
        "message": "User deleted successfully.",
        "total_users": count_users(db),
        "max_users": MAX_SERVER_USERS,
    }


def build_vendor_access_studies_export(db: Session) -> tuple[Path, str]:
    rows = (
        db.query(Study)
        .options(
            joinedload(Study.patient),
            joinedload(Study.user),
            joinedload(Study.derived_results),
            joinedload(Study.series).joinedload(Series.instances),
        )
        .order_by(Study.uploaded_at.desc(), Study.id.desc())
        .all()
    )

    llm_enabled = is_llm_enabled()
    export_file_name = f"horalix-studies-export-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.zip"
    temp_file = tempfile.NamedTemporaryFile(
        prefix="vendor-studies-export-",
        suffix=".zip",
        delete=False,
    )
    temp_file.close()
    archive_path = Path(temp_file.name)

    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for study in rows:
            owner_slug = _sanitize_path_component(
                study.user.username if study.user else None,
                fallback="unknown-user",
            )
            study_slug = _sanitize_path_component(study.study_uid, fallback=f"study-{study.id}")
            study_root = f"{owner_slug}/studies/{study_slug}"
            effective_status = compute_study_status(llm_enabled, status_by_type(study.derived_results or []))

            archive.writestr(
                f"{study_root}/study-metadata.json",
                json.dumps(
                    _study_export_metadata(study, effective_status=effective_status),
                    indent=2,
                    default=_json_default,
                ),
            )

            for series in study.series or []:
                for instance in series.instances or []:
                    file_path = Path(str(instance.file_path or ""))
                    if not file_path.exists() or not file_path.is_file():
                        continue
                    arc_name = (
                        f"{study_root}/dicoms/"
                        f"{_sanitize_path_component(file_path.name, fallback=f'instance-{instance.id}.dcm')}"
                    )
                    archive.write(file_path, arcname=arc_name)

            for row in study.derived_results or []:
                row_type = _sanitize_path_component(row.type, fallback="result")
                archive.writestr(
                    f"{study_root}/derived_results/{row.id:06d}_{row_type}.json",
                    json.dumps(
                        _derived_result_export_payload(row),
                        indent=2,
                        default=_json_default,
                    ),
                )

        unmatched_rows = (
            db.query(DerivedResult)
            .outerjoin(Study, DerivedResult.study_id == Study.id)
            .filter(Study.id.is_(None))
            .order_by(DerivedResult.id.asc())
            .all()
        )
        for row in unmatched_rows:
            row_type = _sanitize_path_component(row.type, fallback="result")
            archive.writestr(
                f"unmatched_derived_results/{row.id:06d}_{row_type}.json",
                json.dumps(
                    _derived_result_export_payload(row),
                    indent=2,
                    default=_json_default,
                ),
            )

    return archive_path, export_file_name


def read_vendor_access_log_tail(*, lines: int) -> dict[str, object]:
    normalized_lines = min(max(lines, 1), MAX_VENDOR_LOG_TAIL_LINES)
    log_file_path = _resolve_vendor_access_log_file()

    if not log_file_path.exists():
        return {
            "file_path": str(log_file_path),
            "updated_at": None,
            "lines": [],
        }

    updated_at = datetime.fromtimestamp(log_file_path.stat().st_mtime, tz=timezone.utc)
    return {
        "file_path": str(log_file_path),
        "updated_at": updated_at,
        "lines": _tail_text_lines(log_file_path, max_lines=normalized_lines),
    }


def get_vendor_access_log_download_path() -> Path:
    log_file_path = _resolve_vendor_access_log_file()
    if not log_file_path.exists():
        raise HTTPException(status_code=404, detail="No active backend log file found.")
    return log_file_path
