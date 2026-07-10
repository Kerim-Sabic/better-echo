from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Index, Integer, JSON, String, func
from sqlalchemy.orm import relationship
from enum import Enum as PyEnum
from app.database.db import Base

class ResultStatus(PyEnum):
    pending = "pending"
    complete = "complete"
    failed = "failed"

class DerivedResult(Base):
    __tablename__ = "derived_results"
    __table_args__ = (
        # Active/draft result lookup by study, result type, artifact set, latest row.
        Index("ix_derived_results_study_type_artifact_id", "study_id", "type", "artifact_set_id", "id"),
        # Per-instance overlay and measurement result lookup.
        Index("ix_derived_results_instance_type_artifact_id", "instance_id", "type", "artifact_set_id", "id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)
    status = Column(Enum(ResultStatus), nullable=True)   
    value_json = Column(JSON, nullable=True)
    model_name = Column(String, nullable=False)
    model_version = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False)
    instance_id = Column(Integer, ForeignKey("instances.id", ondelete="CASCADE"), nullable=True)
    artifact_set_id = Column(Integer, ForeignKey("pipeline_artifact_sets.id", ondelete="SET NULL"), nullable=True, index=True)


    study = relationship("Study", back_populates="derived_results")
    instance = relationship("Instance", back_populates="derived_results")
    artifact_set = relationship("PipelineArtifactSet", back_populates="derived_results")
