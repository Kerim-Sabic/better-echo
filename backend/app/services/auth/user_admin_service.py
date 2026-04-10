from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database_models.users import User
from app.helpers.auth.authentication_functions import hash_password

MAX_SERVER_USERS = 6
ALLOWED_USER_ROLES = {"admin", "doctor"}


class UserAdminValidationError(ValueError):
    """Raised when the submitted admin-management payload is invalid."""


class UserAdminConflictError(ValueError):
    """Raised when the requested admin-management action conflicts with server state."""


class UserAdminAuthorizationError(ValueError):
    """Raised when the acting user is not allowed to perform the admin action."""


class UserAdminNotFoundError(ValueError):
    """Raised when the requested user record does not exist."""


def bootstrap_admin_user(
    db: Session,
    *,
    username: str,
    password: str,
    full_name: str,
) -> User:
    """
    Create the first server admin if and only if the users table is empty.

    Steps:
    1. Normalize and validate the submitted fields.
    2. Reject bootstrap once any user already exists.
    3. Persist the first admin with a hashed password.
    """
    normalized_username = username.strip()
    normalized_full_name = full_name.strip()

    if not normalized_username:
        raise UserAdminValidationError("Username is required.")
    if not password:
        raise UserAdminValidationError("Password is required.")
    if not normalized_full_name:
        raise UserAdminValidationError("Full name is required.")

    if db.query(User.id).first() is not None:
        raise UserAdminConflictError(
            "Bootstrap admin is only available before the first user is created."
        )

    admin_user = User(
        username=normalized_username,
        hashed_password=hash_password(password),
        full_name=normalized_full_name,
        role="admin",
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)
    return admin_user


def list_managed_users(db: Session, *, acting_user_id: int) -> list[User]:
    """
    Return all server users for an authenticated admin.

    Steps:
    1. Authorize the acting user as an admin.
    2. Return a deterministic user list for the management UI.
    """
    _require_admin_actor(db, acting_user_id)
    return (
        db.query(User)
        .order_by(User.created_at.asc(), User.id.asc())
        .all()
    )


def create_managed_user(
    db: Session,
    *,
    acting_user_id: int,
    username: str,
    password: str,
    full_name: str,
    role: str,
) -> User:
    """
    Create a new managed user under the hard pilot seat cap.

    Steps:
    1. Authorize the acting user as an admin.
    2. Validate the requested seat, role, and unique username.
    3. Persist the new user with a hashed password.
    """
    _require_admin_actor(db, acting_user_id)
    return create_managed_user_record(
        db,
        username=username,
        password=password,
        full_name=full_name,
        role=role,
    )


def create_managed_user_record(
    db: Session,
    *,
    username: str,
    password: str,
    full_name: str,
    role: str,
) -> User:
    """
    Create a new managed user without checking the acting principal.

    This is used by the isolated vendor-access subsystem, which applies its own
    authorization boundary before calling into the shared validation logic.
    """
    normalized_username = _normalize_username(username)
    normalized_full_name = _normalize_full_name(full_name)
    normalized_role = _normalize_role(role)

    if count_users(db) >= MAX_SERVER_USERS:
        raise UserAdminConflictError(
            f"User limit reached. This server allows at most {MAX_SERVER_USERS} users."
        )
    if not password:
        raise UserAdminValidationError("Password is required.")
    if _username_exists(db, normalized_username):
        raise UserAdminConflictError("Username already exists.")

    managed_user = User(
        username=normalized_username,
        hashed_password=hash_password(password),
        full_name=normalized_full_name,
        role=normalized_role,
    )
    db.add(managed_user)
    db.commit()
    db.refresh(managed_user)
    return managed_user


def update_managed_user(
    db: Session,
    *,
    acting_user_id: int,
    target_user_id: int,
    username: str,
    full_name: str,
    role: str,
    password: str | None = None,
) -> User:
    """
    Update a managed user's editable fields for an authenticated admin.

    Steps:
    1. Authorize the acting user as an admin.
    2. Load and validate the target user and requested changes.
    3. Persist the updated username/full name/role and optional password reset.
    """
    _require_admin_actor(db, acting_user_id)
    return update_managed_user_record(
        db,
        target_user_id=target_user_id,
        username=username,
        full_name=full_name,
        role=role,
        password=password,
        protect_last_admin=True,
    )


def update_managed_user_record(
    db: Session,
    *,
    target_user_id: int,
    username: str,
    full_name: str,
    role: str,
    password: str | None = None,
    protect_last_admin: bool = True,
) -> User:
    """
    Update a managed user without checking the acting principal.

    `protect_last_admin=True` preserves the existing hospital-admin safety rule.
    Vendor access can explicitly disable that rule when emergency account
    recovery requires taking over the final admin seat.
    """
    target_user = _get_user_or_raise(db, target_user_id)
    normalized_username = _normalize_username(username)
    normalized_full_name = _normalize_full_name(full_name)
    normalized_role = _normalize_role(role)

    if _username_exists(db, normalized_username, exclude_user_id=target_user.id):
        raise UserAdminConflictError("Username already exists.")

    if (
        protect_last_admin
        and target_user.role == "admin"
        and normalized_role != "admin"
        and count_admin_users(db) <= 1
    ):
        raise UserAdminConflictError("The last remaining admin cannot be demoted.")

    target_user.username = normalized_username
    target_user.full_name = normalized_full_name
    target_user.role = normalized_role
    if password is not None:
        target_user.hashed_password = hash_password(password)

    db.commit()
    db.refresh(target_user)
    return target_user


def delete_managed_user(
    db: Session,
    *,
    acting_user_id: int,
    target_user_id: int,
) -> None:
    """
    Delete a managed user if the action keeps admin access safe.

    Steps:
    1. Authorize the acting user as an admin.
    2. Reject self-delete and last-admin deletion.
    3. Delete the target user and commit the change.
    """
    _require_admin_actor(db, acting_user_id)
    if target_user_id == acting_user_id:
        raise UserAdminConflictError("Admins cannot delete their own account.")
    delete_managed_user_record(
        db,
        target_user_id=target_user_id,
        protect_last_admin=True,
    )


def delete_managed_user_record(
    db: Session,
    *,
    target_user_id: int,
    protect_last_admin: bool = True,
) -> None:
    """
    Delete a managed user without checking the acting principal.

    `protect_last_admin=True` preserves the existing hospital-admin safety rule.
    Vendor access can disable that rule explicitly.
    """
    target_user = _get_user_or_raise(db, target_user_id)

    if protect_last_admin and target_user.role == "admin" and count_admin_users(db) <= 1:
        raise UserAdminConflictError("The last remaining admin cannot be deleted.")

    db.delete(target_user)
    db.commit()


def count_users(db: Session) -> int:
    return int(db.query(func.count(User.id)).scalar() or 0)


def count_admin_users(db: Session) -> int:
    return int(db.query(func.count(User.id)).filter(User.role == "admin").scalar() or 0)


def get_admin_setup_status(db: Session) -> dict[str, int | bool]:
    total_users = count_users(db)
    admin_count = count_admin_users(db)
    return {
        "bootstrap_required": total_users == 0,
        "total_users": total_users,
        "admin_count": admin_count,
        "max_users": MAX_SERVER_USERS,
    }


def serialize_managed_user(user: User) -> dict[str, int | str]:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name or "",
    }


def _require_admin_actor(db: Session, acting_user_id: int) -> User:
    acting_user = db.query(User).filter(User.id == acting_user_id).first()
    if acting_user is None or acting_user.role != "admin":
        raise UserAdminAuthorizationError("Admin privileges are required.")
    return acting_user


def _get_user_or_raise(db: Session, user_id: int) -> User:
    target_user = db.query(User).filter(User.id == user_id).first()
    if target_user is None:
        raise UserAdminNotFoundError("User not found.")
    return target_user


def _username_exists(db: Session, username: str, *, exclude_user_id: int | None = None) -> bool:
    query = db.query(User.id).filter(User.username == username)
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.first() is not None


def _normalize_username(username: str) -> str:
    normalized_username = username.strip()
    if not normalized_username:
        raise UserAdminValidationError("Username is required.")
    return normalized_username


def _normalize_full_name(full_name: str) -> str:
    normalized_full_name = full_name.strip()
    if not normalized_full_name:
        raise UserAdminValidationError("Full name is required.")
    return normalized_full_name


def _normalize_role(role: str) -> str:
    normalized_role = role.strip().lower()
    if normalized_role not in ALLOWED_USER_ROLES:
        raise UserAdminValidationError(
            f"Role must be one of: {', '.join(sorted(ALLOWED_USER_ROLES))}."
        )
    return normalized_role
