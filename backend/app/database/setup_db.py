"""Initialize the configured database schema."""

import argparse

from app.database.db import Base, engine

# IMPORTANT: DO NOT REMOVE!! import models so they register with Base.metadata
from app.database_models import *  # noqa: F401,F403


def init_db(drop: bool = False):
    """Create tables on the configured engine, optionally after a full drop."""
    if drop:
        print("Dropping all existing tables...")
        Base.metadata.drop_all(bind=engine)

    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
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
