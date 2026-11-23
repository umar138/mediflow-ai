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
    display_token: str


class IntakeCreateRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=150)
    cnic: Optional[str] = Field(default=None, max_length=25)
    phone_number: Optional[str] = Field(default=None, max_length=30)
    gender: Optional[str] = "other"
    age_years: int = Field(..., ge=0, le=130)
    preferred_language: Literal["en", "ur", "roman_ur"] = "en"
    symptom_text: str = Field(..., min_length=1, max_length=2000)
    input_mode: Literal["TEXT", "VOICE"] = "TEXT"
    department_id: UUID
    patient_reported_duration: Optional[str] = Field(default=None, max_length=100)
    card_type: Optional[str] = None


class CreatedTicketSummary(BaseModel):
    ticket_id: UUID
    token_code: str
    status: str
    urgency: str
    queue_position: int
    eta_min_minutes: Optional[int] = None
    eta_max_minutes: Optional[int] = None
    triage_card_type: str = "GREEN"
    triage_card_title: str = ""
    triage_card_message: str = ""


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
    room_number: Optional[str] = None
    called_by_doctor_name: Optional[str] = None
    clinician_note: Optional[str] = None
    triage_card_type: str = "GREEN"
    triage_card_title: str = ""
    triage_card_message: str = ""


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
    degrees: Optional[str] = None
    specialization: Optional[str] = None
    room_number: Optional[str] = None
    department_name: Optional[str] = None


class WalkInTicketCreateRequest(BaseModel):
    clinic_id: UUID
    department_id: UUID
    display_name: str = Field(..., min_length=1, max_length=150)
    age_years: int = Field(..., ge=0, le=130)
    preferred_language: Literal["en", "ur", "roman_ur"] = "en"
    symptom_text: str = Field(..., min_length=1, max_length=2000)
    input_mode: Literal["TEXT", "VOICE"] = "TEXT"
    patient_reported_duration: Optional[str] = None
    card_type: Optional[str] = None


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
    room_number: Optional[str] = None
    called_by_doctor_name: Optional[str] = None
    patient_name: Optional[str] = None
    patient_cnic: Optional[str] = None
    patient_phone: Optional[str] = None
    department_name: Optional[str] = None
    triage_card_type: str = "GREEN"


class QueueResponseOut(BaseModel):
    generated_at: datetime
    active_delay_minutes: int = 0
    tickets: List[QueueTicketItemOut]


class TicketActionRequest(BaseModel):
    doctor_id: Optional[UUID] = None
    clinician_note: Optional[str] = None
    room_number: Optional[str] = None
    diagnosis: Optional[str] = None
    prescription_medicines: Optional[List[dict]] = None
    lab_tests: Optional[str] = None
    advice: Optional[str] = None
    follow_up: Optional[str] = None


class DelayCreateRequest(BaseModel):
    department_id: Optional[UUID] = None
    delay_minutes: int = Field(..., ge=0, le=240)
    reason: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True


class PublicDisplayOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    clinic_name: str
    now_serving: List[str]
    now_serving_status: Optional[dict[str, str]] = None
    next_up: List[str]
    clinic_status: str
    public_notice: str
    updated_at: datetime


# --- Real-world Patient Authentication & History Schemas ---
class PatientRegisterRequest(BaseModel):
    clinic_slug: str = "mediflow-central"
    full_name: str = Field(..., min_length=2, max_length=150)
    cnic: str = Field(..., min_length=13, max_length=20)
    phone_number: str = Field(..., min_length=10, max_length=20)
    age_years: int = Field(..., ge=0, le=130)
    gender: Literal["male", "female", "other"] = "other"
    email: Optional[str] = None
    password: str = Field(..., min_length=6)
    preferred_language: Literal["en", "ur", "roman_ur"] = "en"


class PatientLoginRequest(BaseModel):
    identifier: str = Field(..., description="CNIC or Email")
    password: str = Field(..., min_length=4)


class PatientAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    patient_id: UUID
    full_name: str
    cnic: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    age_years: int
    clinic_id: UUID
    clinic_slug: str


class ForgotPasswordRequest(BaseModel):
    identifier: str = Field(..., description="Email or CNIC")
    new_password: Optional[str] = None


class ForgotPasswordResponse(BaseModel):
    status: str
    message: str
    recovered_password: Optional[str] = None
    reset_token: Optional[str] = None


class PatientHistoryItem(BaseModel):
    ticket_id: UUID
    token_code: str
    tracking_token: Optional[str] = None
    visit_date: datetime
    department_name: str
    doctor_name: Optional[str] = None
    doctor_degrees: Optional[str] = None
    doctor_license: Optional[str] = None
    room_number: Optional[str] = None
    status: str
    urgency: str
    triage_card_type: str
    symptoms: str
    clinician_note: Optional[str] = None
    diagnosis: Optional[str] = None
    prescription_medicines: Optional[List[dict]] = None
    lab_tests: Optional[str] = None
    advice: Optional[str] = None
    follow_up: Optional[str] = None
    vitals: Optional[dict] = None
    queue_position: Optional[int] = None
    ahead_count: Optional[int] = None
    eta_min_minutes: Optional[int] = None
    eta_max_minutes: Optional[int] = None


class PatientHistoryResponse(BaseModel):
    patient_id: UUID
    full_name: str
    cnic: Optional[str] = None
    total_visits: int
    history: List[PatientHistoryItem]


# --- Real-world Doctor Registration & Onboarding Schemas ---
class DoctorRegisterRequest(BaseModel):
    clinic_slug: str = "mediflow-central"
    full_name: str = Field(..., min_length=2, max_length=150)
    email: str = Field(..., min_length=5, max_length=200)
    password: str = Field(..., min_length=6)
    phone_number: Optional[str] = None
    degrees: str = Field(..., min_length=2, max_length=200, description="e.g. MBBS, FCPS Cardiology")
    specialization: str = Field(..., min_length=2, max_length=100, description="e.g. Cardiologist")
    license_number: str = Field(..., min_length=3, max_length=80, description="PMDC / Medical License ID")
    department_id: Optional[UUID] = None
    department_code: Optional[str] = "GP"
    room_number: str = Field(default="Room 101", max_length=50)


class DoctorRegisterResponse(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    role: str
    degrees: str
    specialization: str
    room_number: str
    department_name: str
    clinic_name: str
    access_token: str
    token_type: str = "bearer"
