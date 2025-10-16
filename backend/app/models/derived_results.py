from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.sqlite import JSON
from app.database.db import Base

class DerivedResult(Base):
    __tablename__ = "derived_results"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)           
    value_json = Column(JSON, nullable=True)
    panecho_echoprime_overlapping_tasks = Column(JSON, nullable=True)
    panecho_only_tasks = Column(JSON, nullable=True)
    echoprime_only_tasks = Column(JSON, nullable=True)
    disagreement_flags = Column(JSON, nullable=True)
    model_name = Column(String, nullable=False)
    model_version = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False)
    instance_id = Column(Integer, ForeignKey("instances.id", ondelete="CASCADE"), nullable=True)


    study = relationship("Study", back_populates="derived_results")
    instance = relationship("Instance", back_populates="derived_results")
