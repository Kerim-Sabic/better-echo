from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database.db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False, index=True)
    full_name = Column(String, nullable=True)
    role = Column(String, default="doctor")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    studies = relationship(
        "Study",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    webauthn_credentials = relationship(
        "WebAuthnCredential",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    pipeline_jobs = relationship(
        "PipelineJob",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
