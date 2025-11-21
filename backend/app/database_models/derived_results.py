from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.sqlite import JSON
from enum import Enum as PyEnum
from app.database.db import Base

class ResultStatus(PyEnum):
    pending = "pending"
    complete = "complete"
    failed = "failed"

class DerivedResult(Base):
    __tablename__ = "derived_results"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)
    status = Column(Enum(ResultStatus), nullable=True)   
    value_json = Column(JSON, nullable=True)
    model_name = Column(String, nullable=False)
    model_version = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False)
    instance_id = Column(Integer, ForeignKey("instances.id", ondelete="CASCADE"), nullable=True)


    study = relationship("Study", back_populates="derived_results")
    instance = relationship("Instance", back_populates="derived_results")
