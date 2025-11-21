"""
Initialize (or reset) the database schema.

- Uses the shared Base from app/database/db.py
- Imports models so their tables are registered with Base.metadata
- Drops all tables (⚠️ destructive!)
- Recreates tables on the configured engine
"""

from app.database.db import engine, Base

# IMPORTANT: DO NOT REMOVE!! import models so they register with Base.metadata
from app.models import *


def init_db(drop: bool = True):
    """
    Initialize the database schema.

    Args:
        drop (bool): If true, drops all existing tables before recreating.
    """
    if drop:
        print("⚠️ Dropping all existing tables...")
        Base.metadata.drop_all(bind=engine)
    
    print("🛠️ Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialized: tables created/verified.")


if __name__ == "__main__":
    # Run as a script -> drops and recreates schema
    init_db(drop=True)
