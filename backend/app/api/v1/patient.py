import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.models.entities import (
    Patient, Clinic, Department, StaffUser, QueueTicket,
    Consultation, IntakeRecord, TriageAssessment, PasswordResetToken,
    PatientTrackingToken, VitalObservation, TicketStatus, PreferredLanguage
)
from app.schemas.contracts import (
    PatientRegisterRequest, PatientLoginRequest, PatientAuthResponse,
    ForgotPasswordRequest, ForgotPasswordResponse,
    PatientHistoryResponse, PatientHistoryItem
)
from app.services.queue import get_sorted_waiting_tickets
from app.services.eta import calculate_eta_range

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

    try:
        patient_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid patient token")

    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
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

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No patient account found with CNIC/Email: {ident}",
        )

    new_pass = req.new_password.strip() if req.new_password else f"MediFlow@{secrets.randbelow(8999) + 1000}"
    patient.password_hash = get_password_hash(new_pass)
    db.commit()

    return ForgotPasswordResponse(
        status="success",
        message=f"آپ کا پاسورڈ یہ ہے: {new_pass}",
        recovered_password=new_pass,
        reset_token=None,
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
        tok_row = db.query(PatientTrackingToken).filter(PatientTrackingToken.ticket_id == tkt.ticket_id).first()
        vital = db.query(VitalObservation).filter(VitalObservation.ticket_id == tkt.ticket_id).first()

        vitals_dict = None
        if vital:
            vitals_dict = {
                "systolic_bp": vital.systolic_bp,
                "diastolic_bp": vital.diastolic_bp,
                "temperature_c": float(vital.temperature_c) if vital.temperature_c is not None else None,
                "spo2_percent": vital.spo2_percent,
                "pulse_bpm": vital.pulse_bpm,
            }

        ahead = 0
        queue_pos = None
        eta_min = None
        eta_max = None
        if tkt.status == TicketStatus.WAITING:
            sorted_waiting = get_sorted_waiting_tickets(db, tkt.clinic_id, tkt.department_id)
            for idx, (t_item, _, _) in enumerate(sorted_waiting):
                if t_item.ticket_id == tkt.ticket_id:
                    ahead = idx
                    break
            eta_min, eta_max, queue_pos = calculate_eta_range(
                db, tkt.clinic_id, ahead_count=ahead, doctor_id=tkt.doctor_id, department_id=tkt.department_id
            )

        items.append(PatientHistoryItem(
            ticket_id=tkt.ticket_id,
            token_code=tkt.token_code,
            tracking_token=tok_row.tracking_token if tok_row else None,
            visit_date=tkt.checked_in_at,
            department_name=dept.name if dept else "General",
            doctor_name=doc.full_name if doc else tkt.called_by_doctor_name,
            doctor_degrees=doc.degrees if doc else None,
            doctor_license=doc.license_number if doc else None,
            room_number=tkt.room_number or (doc.room_number if doc else None),
            status=tkt.status.value,
            urgency=tkt.urgency.value,
            triage_card_type=tkt.urgency.value,
            symptoms=intake.symptom_text if intake else "Reported symptoms",
            clinician_note=consult.clinician_note if consult else None,
            diagnosis=consult.diagnosis if consult else None,
            prescription_medicines=consult.prescription_medicines if consult else None,
            lab_tests=consult.lab_tests if consult else None,
            advice=consult.advice if consult else None,
            follow_up=consult.follow_up if consult else None,
            vitals=vitals_dict,
            queue_position=queue_pos,
            ahead_count=ahead if tkt.status == TicketStatus.WAITING else 0,
            eta_min_minutes=eta_min,
            eta_max_minutes=eta_max,
        ))

    return PatientHistoryResponse(
        patient_id=patient.patient_id,
        full_name=patient.display_name,
        cnic=patient.cnic,
        total_visits=len(items),
        history=items,
    )
