from sqlalchemy import (Column, Integer, String, ForeignKey, Float)
from sqlalchemy.orm import relationship
from app.database.db import Base


class Instance(Base):
    __tablename__ = "instances"

    id = Column(Integer, primary_key=True, index=True)
    sop_instance_uid = Column(String, unique=True, nullable=False)  # DICOM tag (0008,0018)
    file_path = Column(String, nullable=True)  # if stored locally
    instance_orthanc_id = Column(String, unique=True, nullable=True)  # Orthanc's internal UUID
    predicted_view = Column(String, nullable=True)
    predicted_view_confidence = Column(Float, nullable=True)

    series_id = Column(Integer, ForeignKey("series.id", ondelete="CASCADE"), nullable=False)

    series = relationship("Series", back_populates="instances")
    derived_results = relationship(
        "DerivedResult",
        back_populates="instance",
        cascade="all, delete-orphan",
        passive_deletes=True
    )