from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database.db import Base

class DerivedResult(Base):
    __tablename__ = "derived_results"

    id = Column(Integer, primary_key=True)
    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)           # 'EF', etc.
    value_numeric = Column(Float)
    value_json = Column(String)                     # optional: JSON string if needed
    units = Column(String)
    model_name = Column(String, nullable=False)
    model_version = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    study = relationship("Study", back_populates="derived_results")
