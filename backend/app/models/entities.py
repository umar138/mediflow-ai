import enum
from datetime import datetime, date, timezone
from sqlalchemy import (
    String, Integer, Float, Boolean, DateTime, Date, Text,
    ForeignKey, Enum as SQLEnum, JSON, Index, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --- Canonical Enums (Exact Contract v1.0) ---
class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    RECEPTIONIST = "RECEPTIONIST"
    NURSE = "NURSE"
    DOCTOR = "DOCTOR"


class TicketStatus(str, enum.Enum):
    WAITING = "WAITING"
    CALLED = "CALLED"
    IN_CONSULTATION = "IN_CONSULTATION"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"
    ON_HOLD = "ON_HOLD"


class UrgencyTier(str, enum.Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"


class IntakeChannel(str, enum.Enum):
    QR = "QR"
    WALK_IN = "WALK_IN"
    STAFF = "STAFF"


class InputMode(str, enum.Enum):
    TEXT = "TEXT"
    VOICE = "VOICE"


class PreferredLanguage(str, enum.Enum):
    en = "en"
    ur = "ur"
    roman_ur = "roman_ur"


class TriageSource(str, enum.Enum):
    RULES = "RULES"
    LLM = "LLM"
    HUMAN = "HUMAN"
    COMBINED = "COMBINED"


# --- Core Entities (15 Tables) ---
class Clinic(Base):
    __tablename__ = "clinics"

    clinic_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    public_notice: Mapped[str] = mapped_column(Text, default="Welcome to MediFlow Clinic. Please wait for your token.")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Department(Base):
    __tablename__ = "departments"

    department_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clinic_id: Mapped[int] = mapped_column(Integer, ForeignKey("clinics.clinic_id", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    floor_or_wing: Mapped[str | None] = mapped_column(String(100), default="Ground Floor", nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("clinic_id", "code", name="uq_clinic_dept_code"),
    )


class StaffUser(Base):
    __tablename__ = "staff_users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    degrees: Mapped[str | None] = mapped_column(String(200), nullable=True)
    specialization: Mapped[str | None] = mapped_column(String(100), nullable=True)
    license_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    room_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_present: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ClinicMembership(Base):
    __tablename__ = "clinic_memberships"

    membership_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("staff_users.user_id", ondelete="CASCADE"), nullable=False)
    clinic_id: Mapped[int] = mapped_column(Integer, ForeignKey("clinics.clinic_id", ondelete="CASCADE"), nullable=False)
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.department_id", ondelete="SET NULL"), nullable=True)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole, name="user_role"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "clinic_id", name="uq_user_clinic_membership"),
    )


class Patient(Base):
    __tablename__ = "patients"

    patient_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clinic_id: Mapped[int] = mapped_column(Integer, ForeignKey("clinics.clinic_id", ondelete="CASCADE"), nullable=False)
    display_name: Mapped[str] = mapped_column(String(150), nullable=False)
    cnic: Mapped[str | None] = mapped_column(String(25), unique=True, nullable=True, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    age_years: Mapped[int] = mapped_column(Integer, nullable=False)
    gender: Mapped[str | None] = mapped_column(String(20), default="other", nullable=True)
    preferred_language: Mapped[PreferredLanguage] = mapped_column(
        SQLEnum(PreferredLanguage, name="preferred_language"), default=PreferredLanguage.en
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QueueTicket(Base):
    __tablename__ = "queue_tickets"

    ticket_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clinic_id: Mapped[int] = mapped_column(Integer, ForeignKey("clinics.clinic_id", ondelete="CASCADE"), nullable=False)
    department_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.department_id", ondelete="RESTRICT"), nullable=False)
    patient_id: Mapped[int] = mapped_column(Integer, ForeignKey("patients.patient_id", ondelete="RESTRICT"), nullable=False)
    doctor_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("staff_users.user_id", ondelete="SET NULL"), nullable=True)

    token_code: Mapped[str] = mapped_column(String(20), nullable=False)
    service_date: Mapped[date] = mapped_column(Date, default=lambda: utcnow().date(), nullable=False)
    appointment_slot: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[TicketStatus] = mapped_column(SQLEnum(TicketStatus, name="ticket_status"), default=TicketStatus.WAITING, nullable=False)
    urgency: Mapped[UrgencyTier] = mapped_column(SQLEnum(UrgencyTier, name="urgency_tier"), default=UrgencyTier.GREEN, nullable=False)
    priority_score: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    channel: Mapped[IntakeChannel] = mapped_column(SQLEnum(IntakeChannel, name="intake_channel"), default=IntakeChannel.QR, nullable=False)
    room_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    called_by_doctor_name: Mapped[str | None] = mapped_column(String(150), nullable=True)

    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consultation_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_wait_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("staff_users.user_id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_queue_clinic_dept_status_score", "clinic_id", "department_id", "status", "priority_score"),
        Index("ix_queue_patient_time", "patient_id", "checked_in_at"),
    )


class IntakeRecord(Base):
    __tablename__ = "intake_records"

    intake_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("queue_tickets.ticket_id", ondelete="CASCADE"), unique=True, nullable=False)
    symptom_text: Mapped[str] = mapped_column(Text, nullable=False)
    input_mode: Mapped[InputMode] = mapped_column(SQLEnum(InputMode, name="input_mode"), default=InputMode.TEXT, nullable=False)
    patient_reported_duration: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class VitalObservation(Base):
    __tablename__ = "vital_observations"

    vital_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("queue_tickets.ticket_id", ondelete="CASCADE"), nullable=False)
    systolic_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diastolic_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    spo2_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pulse_bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    recorded_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("staff_users.user_id", ondelete="SET NULL"), nullable=True)


class TriageAssessment(Base):
    __tablename__ = "triage_assessments"

    triage_assessment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("queue_tickets.ticket_id", ondelete="CASCADE"), nullable=False)
    clinic_id: Mapped[int] = mapped_column(Integer, ForeignKey("clinics.clinic_id", ondelete="CASCADE"), nullable=False)
    source: Mapped[TriageSource] = mapped_column(SQLEnum(TriageSource, name="triage_source"), nullable=False)
    urgency: Mapped[UrgencyTier] = mapped_column(SQLEnum(UrgencyTier, name="urgency_tier"), nullable=False)
    normalized_symptoms: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    red_flag_reasons: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    uncertainties: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    recommended_department: Mapped[str | None] = mapped_column(String(150), nullable=True)
    doctor_pre_brief: Mapped[str] = mapped_column(Text, nullable=False)
    model_provider: Mapped[str] = mapped_column(String(100), default="deterministic-rules")
    model_name: Mapped[str] = mapped_column(String(100), default="none")
    prompt_version: Mapped[str] = mapped_column(String(50), default="triage-prompt-v1.0")
    rule_set_version: Mapped[str] = mapped_column(String(50), default="demo-rules-v1.0")
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    human_reviewed_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("staff_users.user_id", ondelete="SET NULL"), nullable=True)
    human_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_triage_ticket_time", "ticket_id", "created_at"),
    )


class TriageRuleHit(Base):
    __tablename__ = "triage_rule_hits"

    rule_hit_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    triage_assessment_id: Mapped[int] = mapped_column(Integer, ForeignKey("triage_assessments.triage_assessment_id", ondelete="CASCADE"), nullable=False)
    rule_code: Mapped[str] = mapped_column(String(80), nullable=False)
    rule_version: Mapped[str] = mapped_column(String(50), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Consultation(Base):
    __tablename__ = "consultations"

    consultation_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("queue_tickets.ticket_id", ondelete="CASCADE"), unique=True, nullable=False)
    doctor_id: Mapped[int] = mapped_column(Integer, ForeignKey("staff_users.user_id", ondelete="RESTRICT"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clinician_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)
    prescription_medicines: Mapped[list | None] = mapped_column(JSON, nullable=True)
    lab_tests: Mapped[str | None] = mapped_column(Text, nullable=True)
    advice: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up: Mapped[str | None] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        Index("ix_consultation_doctor_completed", "doctor_id", "completed_at"),
    )


class ClinicDelay(Base):
    __tablename__ = "clinic_delays"

    delay_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clinic_id: Mapped[int] = mapped_column(Integer, ForeignKey("clinics.clinic_id", ondelete="CASCADE"), nullable=False)
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.department_id", ondelete="CASCADE"), nullable=True)
    delay_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("staff_users.user_id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PatientTrackingToken(Base):
    __tablename__ = "patient_tracking_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("queue_tickets.ticket_id", ondelete="CASCADE"), unique=True, nullable=False)
    tracking_token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DisplayAccessToken(Base):
    __tablename__ = "display_access_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clinic_id: Mapped[int] = mapped_column(Integer, ForeignKey("clinics.clinic_id", ondelete="CASCADE"), nullable=False)
    display_token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(100), default="Main Waiting Area TV")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    audit_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clinic_id: Mapped[int] = mapped_column(Integer, ForeignKey("clinics.clinic_id", ondelete="CASCADE"), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("staff_users.user_id", ondelete="SET NULL"), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_audit_entity_time", "entity_type", "entity_id", "created_at"),
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
