from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from .base import Base  # assuming a Base declarative class exists

class Hospital(Base):
    __tablename__ = "hospitals"
    hospital_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    departments = relationship("Department", back_populates="hospital")
    doctors = relationship("Doctor", back_populates="hospital")

class Specialization(Base):
    __tablename__ = "specializations"
    specialization_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)

    doctors = relationship("Doctor", back_populates="specialization")

class Doctor(Base):
    __tablename__ = "doctors"
    doctor_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id = Column(UUID(as_uuid=True), ForeignKey("hospitals.hospital_id", ondelete="CASCADE"), nullable=False)
    email = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    specialization_id = Column(UUID(as_uuid=True), ForeignKey("specializations.specialization_id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hospital = relationship("Hospital", back_populates="doctors")
    specialization = relationship("Specialization", back_populates="doctors")
    tickets = relationship("QueueTicket", back_populates="doctor")
