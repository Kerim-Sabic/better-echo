from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database.db import Base

class DerivedResult(Base):
    __tablename__ = "derived_results"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)           
    value_numeric = Column(Float)
    value_json = Column(String)                     # optional: JSON string if needed
    units = Column(String)
    model_name = Column(String, nullable=False)
    model_version = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False)
    instance_id = Column(Integer, ForeignKey("instances.id", ondelete="CASCADE"), nullable=True)


    study = relationship("Study", back_populates="derived_results")
    instance = relationship("Instance", back_populates="derived_results")
