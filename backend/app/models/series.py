from sqlalchemy import (Column, Integer, String, ForeignKey)
from sqlalchemy.orm import relationship
from app.database.db import Base

class Series(Base):
    __tablename__ = "series"

    id = Column(Integer, primary_key=True, index=True)
    series_uid = Column(String, unique=True, nullable=False)  # DICOM tag (0020,000E)
    modality = Column(String, nullable=True)                  # DICOM tag (0008,0060)
    description = Column(String, nullable=True)               # DICOM tag (0008,103E)
    series_orthanc_id = Column(String, unique=True, nullable=False)

    study_id = Column(Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False)
    study = relationship("Study", back_populates="series")

    instances = relationship(
        "Instance",
        back_populates="series",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
