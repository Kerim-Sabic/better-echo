from sqlalchemy import Column, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship
from app.database.db import Base


class Instance(Base):
    __tablename__ = "instances"
    __table_args__ = (Index("ix_instances_series_id", "series_id"),)

    id = Column(Integer, primary_key=True, index=True)
    sop_instance_uid = Column(String, unique=True, nullable=False)  # DICOM tag (0008,0018)
    file_path = Column(String, nullable=True)  # if stored locally
    instance_orthanc_id = Column(String, unique=True, nullable=True)  # Orthanc's internal UUID
    instance_number = Column(String, nullable=True)  # DICOM tag (0020,0013)
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
