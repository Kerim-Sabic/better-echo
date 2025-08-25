from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime
from .base import Base

class Study(Base):
    __tablename__ = "studies"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String, unique=True, nullable=False)
    patient_id = Column(String)
    study_uid = Column(String, nullable=True)
    study_date = Column(String)
    file_path = Column(String)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="processing")
    ef_value = Column(Float, nullable=True)
