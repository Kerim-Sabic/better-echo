from sqlalchemy import (Column, Integer, String)
from sqlalchemy.orm import relationship
from app.database.db import Base

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String, unique=True, nullable=False)  # DICOM tag (0010,0020)
    patient_name = Column(String, nullable=True)              # DICOM tag (0010,0010)
    patient_sex = Column(String, nullable=True)               # DICOM tag (0010,0040)
    patient_birth_date = Column(String, nullable=True)        # DICOM tag (0010,0030)

    studies = relationship(
        "Study",
        back_populates="patient",
        cascade="all, delete-orphan",
        passive_deletes=True
    )