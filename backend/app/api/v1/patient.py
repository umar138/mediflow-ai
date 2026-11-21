import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.models.entities import (
    Patient, Clinic, Department, StaffUser, QueueTicket,
    Consultation, IntakeRecord, TriageAssessment, PasswordResetToken,
    TicketStatus, PreferredLanguage
)
from app.schemas.contracts import (
    PatientRegisterRequest, PatientLoginRequest, PatientAuthResponse,
    ForgotPasswordRequest, ForgotPasswordResponse,
    PatientHistoryResponse, PatientHistoryItem
)

router = APIRouter(prefix="/patient", tags=["patient"])


def get_current_patient(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Patient:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload or payload.get("role") != "PATIENT":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired patient token")

    patient = db.query(Patient).filter(Patient.patient_id == payload["sub"]).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Patient profile not found")
    return patient


@router.post("/register", response_model=PatientAuthResponse, status_code=status.HTTP_201_CREATED)
def register_patient(req: PatientRegisterRequest, db: Session = Depends(get_db)):
    clean_cnic = req.cnic.strip().replace(" ", "")
    # Check if CNIC already registered
    existing_by_cnic = db.query(Patient).filter(Patient.cnic == clean_cnic).first()
    if existing_by_cnic:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Patient with CNIC {clean_cnic} is already registered. Please sign in instead.",
        )

    # Check if email is already registered
    if req.email:
        clean_email = req.email.strip().lower()
        existing_by_email = db.query(Patient).filter(Patient.email == clean_email).first()
        if existing_by_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Patient with email {clean_email} is already registered. Please sign in instead.",
            )

    # Find clinic
    clinic = db.query(Clinic).filter(Clinic.slug == req.clinic_slug, Clinic.is_active.is_(True)).first()
    if not clinic:
        clinic = db.query(Clinic).filter(Clinic.is_active.is_(True)).first()
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active clinic found.")

    new_patient = Patient(
        clinic_id=clinic.clinic_id,
        display_name=req.full_name.strip(),
        cnic=clean_cnic,
        phone_number=req.phone_number.strip(),
        email=req.email.strip().lower() if req.email else None,
        password_hash=get_password_hash(req.password),
        age_years=req.age_years,
        gender=req.gender,
        preferred_language=PreferredLanguage(req.preferred_language),
    )
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    token = create_access_token({
        "sub": str(new_patient.patient_id),
        "clinic_id": str(clinic.clinic_id),
        "role": "PATIENT",
        "cnic": new_patient.cnic,
    })

    return PatientAuthResponse(
        access_token=token,
        patient_id=new_patient.patient_id,
        full_name=new_patient.display_name,
        cnic=new_patient.cnic,
        phone_number=new_patient.phone_number,
        email=new_patient.email,
        age_years=new_patient.age_years,
        clinic_id=clinic.clinic_id,
        clinic_slug=clinic.slug,
    )


@router.post("/login", response_model=PatientAuthResponse)
def login_patient(req: PatientLoginRequest, db: Session = Depends(get_db)):
    ident = req.identifier.strip()
    clean_ident_cnic = ident.replace(" ", "")

    patient = (
        db.query(Patient)
        .filter((Patient.cnic == clean_ident_cnic) | (Patient.email == ident.lower()))
        .first()
    )

    if not patient or not patient.password_hash or not verify_password(req.password, patient.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid CNIC/Email or password. If you haven't set a password, please sign up.",
        )

    clinic = db.query(Clinic).filter(Clinic.clinic_id == patient.clinic_id).first()
    clinic_slug = clinic.slug if clinic else "mediflow-central"

    token = create_access_token({
        "sub": str(patient.patient_id),
        "clinic_id": str(patient.clinic_id),
        "role": "PATIENT",
        "cnic": patient.cnic,
    })

    return PatientAuthResponse(
        access_token=token,
        patient_id=patient.patient_id,
        full_name=patient.display_name,
        cnic=patient.cnic,
        phone_number=patient.phone_number,
        email=patient.email,
        age_years=patient.age_years,
        clinic_id=patient.clinic_id,
        clinic_slug=clinic_slug,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    ident = req.identifier.strip()
    clean_ident = ident.replace(" ", "")

    patient = (
        db.query(Patient)
        .filter((Patient.email == ident.lower()) | (Patient.cnic == clean_ident))
        .first()
    )

    reset_token = secrets.token_urlsafe(32)
    email_target = patient.email if (patient and patient.email) else ident

    if patient:
        db.add(PasswordResetToken(
            email=email_target,
            token=reset_token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        ))
        db.commit()

    return ForgotPasswordResponse(
        status="success",
        message=f"Password reset instructions have been dispatched to {email_target}. You can use the generated reset token.",
        reset_token=reset_token,
    )


@router.get("/profile")
def get_patient_profile(patient: Patient = Depends(get_current_patient)):
    return {
        "patient_id": patient.patient_id,
        "full_name": patient.display_name,
        "cnic": patient.cnic,
        "phone_number": patient.phone_number,
        "email": patient.email,
        "age_years": patient.age_years,
        "gender": patient.gender,
        "preferred_language": patient.preferred_language.value,
        "created_at": patient.created_at,
    }


@router.get("/history", response_model=PatientHistoryResponse)
def get_patient_history(
    patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    tickets = (
        db.query(QueueTicket)
        .filter(QueueTicket.patient_id == patient.patient_id)
        .order_by(QueueTicket.checked_in_at.desc())
        .all()
    )

    items = []
    for tkt in tickets:
        dept = db.query(Department).filter(Department.department_id == tkt.department_id).first()
        doc = db.query(StaffUser).filter(StaffUser.user_id == tkt.doctor_id).first() if tkt.doctor_id else None
        consult = db.query(Consultation).filter(Consultation.ticket_id == tkt.ticket_id).first()
        intake = db.query(IntakeRecord).filter(IntakeRecord.ticket_id == tkt.ticket_id).first()

        items.append(PatientHistoryItem(
            ticket_id=tkt.ticket_id,
            token_code=tkt.token_code,
            visit_date=tkt.checked_in_at,
            department_name=dept.name if dept else "General",
            doctor_name=doc.full_name if doc else tkt.called_by_doctor_name,
            doctor_degrees=doc.degrees if doc else None,
            room_number=tkt.room_number or (doc.room_number if doc else None),
            status=tkt.status.value,
            urgency=tkt.urgency.value,
            triage_card_type=tkt.urgency.value,
            symptoms=intake.symptom_text if intake else "Reported symptoms",
            clinician_note=consult.clinician_note if consult else None,
        ))

    return PatientHistoryResponse(
        patient_id=patient.patient_id,
        full_name=patient.display_name,
        cnic=patient.cnic,
        total_visits=len(items),
        history=items,
    )
