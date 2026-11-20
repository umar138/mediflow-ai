from datetime import datetime
from typing import List, Optional, Literal
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class DepartmentOut(BaseModel):
    department_id: UUID
    clinic_id: UUID
    code: str
    name: str


class PublicClinicOut(BaseModel):
    clinic_id: UUID
    slug: str
    name: str
    public_notice: str
    departments: List[DepartmentOut]


class IntakeCreateRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=150)
    age_years: int = Field(..., ge=0, le=130)
    preferred_language: Literal["en", "ur", "roman_ur"] = "en"
    symptom_text: str = Field(..., min_length=1, max_length=2000)
    input_mode: Literal["TEXT", "VOICE"] = "TEXT"
    department_id: UUID
    patient_reported_duration: Optional[str] = Field(default=None, max_length=100)


class CreatedTicketSummary(BaseModel):
    ticket_id: UUID
    token_code: str
    status: str
    urgency: str
    queue_position: int
    eta_min_minutes: Optional[int] = None
    eta_max_minutes: Optional[int] = None


class IntakeCreateResponse(BaseModel):
    ticket: CreatedTicketSummary
    tracking_token: str
    safety_message: str


class PublicTicketTrackOut(BaseModel):
    token_code: str
    status: str
    urgency: str
    queue_position: Optional[int] = None
    eta_min_minutes: Optional[int] = None
    eta_max_minutes: Optional[int] = None
    clinic_notice: str
    safety_message: str
    updated_at: datetime


class StaffLoginRequest(BaseModel):
    email: str
    password: str


class StaffLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    full_name: str
    role: str
    clinic_id: UUID
    department_id: Optional[UUID] = None


class WalkInTicketCreateRequest(BaseModel):
    clinic_id: UUID
    department_id: UUID
    display_name: str = Field(..., min_length=1, max_length=150)
    age_years: int = Field(..., ge=0, le=130)
    preferred_language: Literal["en", "ur", "roman_ur"] = "en"
    symptom_text: str = Field(..., min_length=1, max_length=2000)
    input_mode: Literal["TEXT", "VOICE"] = "TEXT"
    patient_reported_duration: Optional[str] = None


class VitalsCreateRequest(BaseModel):
    systolic_bp: Optional[int] = Field(default=None, ge=40, le=300)
    diastolic_bp: Optional[int] = Field(default=None, ge=20, le=200)
    temperature_c: Optional[float] = Field(default=None, ge=25.0, le=45.0)
    spo2_percent: Optional[int] = Field(default=None, ge=30, le=100)
    pulse_bpm: Optional[int] = Field(default=None, ge=20, le=250)
    measured_at: Optional[datetime] = None


class VitalsSnapshot(BaseModel):
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    temperature_c: Optional[float] = None
    spo2_percent: Optional[int] = None
    pulse_bpm: Optional[int] = None


class QueueTicketItemOut(BaseModel):
    ticket_id: UUID
    patient_id: UUID
    doctor_id: Optional[UUID] = None
    department_id: UUID
    token_code: str
    status: str
    urgency: str
    priority_score: int
    wait_minutes: int
    normalized_symptoms: List[str] = Field(default_factory=list)
    red_flag_reasons: List[str] = Field(default_factory=list)
    doctor_pre_brief: str
    vitals: VitalsSnapshot
    eta_min_minutes: Optional[int] = None
    eta_max_minutes: Optional[int] = None


class QueueResponseOut(BaseModel):
    generated_at: datetime
    active_delay_minutes: int = 0
    tickets: List[QueueTicketItemOut]


class TicketActionRequest(BaseModel):
    doctor_id: Optional[UUID] = None
    clinician_note: Optional[str] = None


class DelayCreateRequest(BaseModel):
    department_id: Optional[UUID] = None
    delay_minutes: int = Field(..., ge=0, le=240)
    reason: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True


class PublicDisplayOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    clinic_name: str
    now_serving: List[str]
    next_up: List[str]
    clinic_status: str
    public_notice: str
    updated_at: datetime