from sqlalchemy import ( Column, Integer, String, DateTime, ForeignKey, Float)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database.db import Base

class Study(Base):
    __tablename__ = "studies"

    id = Column(Integer, primary_key=True, index=True)
    study_uid = Column(String, unique=True, nullable=False)   # DICOM tag (0020,000D)
    study_date = Column(String, nullable=True)                # DICOM tag (0008,0020)
    description = Column(String, nullable=True)               # DICOM tag (0008,1030)
    study_orthanc_id = Column(String, unique=True, nullable=False)
    status = Column(String, default="processing")
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    patient_height_cm = Column(Float, nullable=True)          # DICOM tag (0010,1020) meters -> cm
    patient_weight_kg = Column(Float, nullable=True)          # DICOM tag (0010,1030) kg
    heart_rate_bpm = Column(Float, nullable=True)             # DICOM tag (0018,1088) bpm

    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    patient = relationship("Patient", back_populates="studies")
    user = relationship("User", back_populates="studies")

    series = relationship(
        "Series",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    derived_results = relationship(
        "DerivedResult",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
