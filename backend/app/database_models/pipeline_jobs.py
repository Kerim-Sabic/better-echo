from enum import Enum as PyEnum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Index, Integer, JSON, String, func
from sqlalchemy.orm import relationship

from app.database.db import Base


class PipelineJobStatus(PyEnum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class PipelineRunMode(PyEnum):
    upload_preview = "upload_preview"
    append_preview = "append_preview"
    regenerate_combined = "regenerate_combined"


class PipelineCleanupScope(PyEnum):
    none = "none"
    new_study = "new_study"
    append_delta = "append_delta"


class PipelineJob(Base):
    __tablename__ = "pipeline_jobs"
    __table_args__ = (
        Index("ix_pipeline_jobs_status_queued_at", "status", "queued_at"),
        Index("ix_pipeline_jobs_study_id_queued_at", "study_id", "queued_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(Enum(PipelineJobStatus), nullable=False, default=PipelineJobStatus.queued, index=True)
    current_stage = Column(String, nullable=True)
    run_mode = Column(Enum(PipelineRunMode), nullable=False, default=PipelineRunMode.upload_preview)
    cleanup_scope = Column(
        Enum(PipelineCleanupScope),
        nullable=False,
        default=PipelineCleanupScope.none,
    )
    uploaded_instance_uids_json = Column(JSON, nullable=True)
    auto_promote_on_complete = Column(Boolean, nullable=False, default=False)
    last_error = Column(String, nullable=True)
    queued_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    cancel_requested_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    study = relationship("Study", back_populates="pipeline_jobs")
    user = relationship("User", back_populates="pipeline_jobs")
    stage_runs = relationship(
        "PipelineStageRun",
        back_populates="pipeline_job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    artifact_sets = relationship(
        "PipelineArtifactSet",
        back_populates="pipeline_job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
