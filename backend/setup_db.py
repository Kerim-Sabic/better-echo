"""
Initialize the database schema.

- Uses the shared Base from models/base.py
- Imports models so their tables are registered on Base.metadata
- Creates all tables on the configured engine
"""

from db import engine
from models.base import Base

# IMPORTANT: DO NOT REMOVE!! import models so they register with Base.metadata
import models.study          # noqa: F401
import models.derived_result # noqa: F401


def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialized: tables created/verified.")


if __name__ == "__main__":
    init_db()
