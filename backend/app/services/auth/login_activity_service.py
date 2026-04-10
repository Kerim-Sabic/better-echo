from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database_models.users import User


def mark_user_last_login(db: Session, user: User) -> None:
    """Persist the latest successful hospital-user login timestamp."""
    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
