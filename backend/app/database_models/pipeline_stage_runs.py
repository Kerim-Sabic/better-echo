from enum import Enum as PyEnum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, JSON, String, func
from sqlalchemy.orm import relationship

from app.database.db import Base


class PipelineStageStatus(PyEnum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class PipelineStageRun(Base):
    __tablename__ = "pipeline_stage_runs"
    __table_args__ = (
        Index("ix_pipeline_stage_runs_job_stage", "pipeline_job_id", "stage_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    pipeline_job_id = Column(Integer, ForeignKey("pipeline_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_name = Column(String, nullable=False, index=True)
    status = Column(Enum(PipelineStageStatus), nullable=False, default=PipelineStageStatus.queued, index=True)
    payload_json = Column(JSON, nullable=True)
    error = Column(String, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    pipeline_job = relationship("PipelineJob", back_populates="stage_runs")
    study = relationship("Study")
