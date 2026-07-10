"""Initialize the configured database schema."""

import argparse

from sqlalchemy import inspect, text

from app.database.db import Base, engine

# IMPORTANT: DO NOT REMOVE!! import models so they register with Base.metadata
from app.database_models import *  # noqa: F401,F403


_INDEX_MIGRATIONS = (
    "CREATE INDEX IF NOT EXISTS ix_studies_user_uploaded_at ON studies (user_id, uploaded_at)",
    "CREATE INDEX IF NOT EXISTS ix_studies_patient_user_date ON studies (patient_id, user_id, study_date, uploaded_at)",
    "CREATE INDEX IF NOT EXISTS ix_series_study_id ON series (study_id)",
    "CREATE INDEX IF NOT EXISTS ix_instances_series_id ON instances (series_id)",
    "CREATE INDEX IF NOT EXISTS ix_derived_results_study_type_artifact_id ON derived_results (study_id, type, artifact_set_id, id)",
    "CREATE INDEX IF NOT EXISTS ix_derived_results_instance_type_artifact_id ON derived_results (instance_id, type, artifact_set_id, id)",
    "CREATE INDEX IF NOT EXISTS ix_pipeline_jobs_study_status_queued_at ON pipeline_jobs (study_id, status, queued_at)",
    "CREATE INDEX IF NOT EXISTS ix_pipeline_stage_runs_study_status_stage_finished ON pipeline_stage_runs (study_id, status, stage_name, finished_at)",
)


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


def _ensure_query_indexes() -> None:
    """Install idempotent indexes for existing desktop and server databases."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    if not {"studies", "series", "instances", "derived_results", "pipeline_jobs", "pipeline_stage_runs"}.issubset(existing_tables):
        return

    with engine.begin() as connection:
        for statement in _INDEX_MIGRATIONS:
            connection.execute(text(statement))


def init_db(drop: bool = False):
    """Create tables on the configured engine, optionally after a full drop."""
    if drop:
        print("Dropping all existing tables...")
        Base.metadata.drop_all(bind=engine)

    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    _ensure_users_last_login_column()
    _ensure_query_indexes()
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
