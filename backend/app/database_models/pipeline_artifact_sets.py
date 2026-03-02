from enum import Enum as PyEnum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, func
from sqlalchemy.orm import relationship

from app.database.db import Base


class PipelineArtifactSetState(PyEnum):
    draft = "draft"
    active = "active"
    discarded = "discarded"


class PipelineArtifactSet(Base):
    __tablename__ = "pipeline_artifact_sets"
    __table_args__ = (
        Index("ix_pipeline_artifact_sets_study_state", "study_id", "state"),
    )

    id = Column(Integer, primary_key=True, index=True)
    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False, index=True)
    pipeline_job_id = Column(Integer, ForeignKey("pipeline_jobs.id", ondelete="CASCADE"), nullable=True, index=True)
    state = Column(
        Enum(PipelineArtifactSetState),
        nullable=False,
        default=PipelineArtifactSetState.draft,
        index=True,
    )
    input_revision = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    promoted_at = Column(DateTime, nullable=True)
    discarded_at = Column(DateTime, nullable=True)

    study = relationship("Study", back_populates="pipeline_artifact_sets")
    pipeline_job = relationship("PipelineJob", back_populates="artifact_sets")
    derived_results = relationship("DerivedResult", back_populates="artifact_set")

