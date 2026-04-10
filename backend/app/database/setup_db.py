"""Initialize the configured database schema."""

import argparse

from sqlalchemy import inspect, text

from app.database.db import Base, engine

# IMPORTANT: DO NOT REMOVE!! import models so they register with Base.metadata
from app.database_models import *  # noqa: F401,F403


def _ensure_users_last_login_column() -> None:
    """Keep pre-production databases aligned with the current `users` schema."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    if "last_login_at" in existing_columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE NULL"
            )
        )


def init_db(drop: bool = False):
    """Create tables on the configured engine, optionally after a full drop."""
    if drop:
        print("Dropping all existing tables...")
        Base.metadata.drop_all(bind=engine)

    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    _ensure_users_last_login_column()
    print("Database initialized: tables created/verified.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize the configured database schema.")
    parser.add_argument(
        "--drop",
        action="store_true",
        help="Drop all existing tables before recreating them.",
    )
    args = parser.parse_args()
    init_db(drop=args.drop)
