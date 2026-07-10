from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database.db import Base

class Study(Base):
    __tablename__ = "studies"
    __table_args__ = (
        # Dashboard: newest studies for one authenticated clinician.
        Index("ix_studies_user_uploaded_at", "user_id", "uploaded_at"),
        # Longitudinal GLS: one clinician's studies for one patient, in time order.
        Index("ix_studies_patient_user_date", "patient_id", "user_id", "study_date", "uploaded_at"),
    )

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

    pipeline_jobs = relationship(
        "PipelineJob",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    pipeline_artifact_sets = relationship(
        "PipelineArtifactSet",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
