from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import declarative_base

DATABASE_URL = "sqlite:///./database.db"
SQLITE_TIMEOUT_SECONDS = 30
SQLITE_BUSY_TIMEOUT_MS = SQLITE_TIMEOUT_SECONDS * 1000

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": SQLITE_TIMEOUT_SECONDS},
)
Base = declarative_base()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _apply_sqlite_pragmas(dbapi_connection) -> None:
    cursor = dbapi_connection.cursor()
    # Part 1. Keep SQLite responsive under concurrent read/write workload.
    pragmas = (
        ("foreign_keys", "ON"),
        ("busy_timeout", str(SQLITE_BUSY_TIMEOUT_MS)),
        ("journal_mode", "WAL"),
        ("synchronous", "NORMAL"),
    )
    try:
        for key, value in pragmas:
            try:
                cursor.execute(f"PRAGMA {key}={value}")
            except Exception:
                # Keep startup resilient even when one pragma is unsupported.
                continue
    finally:
        cursor.close()


# This enables foreign key constraints and concurrency-friendly SQLite pragmas.
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    _apply_sqlite_pragmas(dbapi_connection)

def get_db():
    """
    Dependency for FastAPI routes.
    Yields a database session, and ensures it's closed after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        
