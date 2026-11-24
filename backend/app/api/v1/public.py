import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.entities import (
    Clinic, Consultation, Department, Patient, QueueTicket, IntakeRecord, StaffUser,
    TriageAssessment, TriageRuleHit, PatientTrackingToken, DisplayAccessToken,
    TicketStatus, UrgencyTier, IntakeChannel, InputMode, PreferredLanguage,
    TriageSource, AuditLog
)
from app.schemas.contracts import (
    PublicClinicOut, DepartmentOut, IntakeCreateRequest, IntakeCreateResponse,
    CreatedTicketSummary, PublicTicketTrackOut, PublicDisplayOut,
    EmergencyIntakeRequest, TriagePreviewRequest, TriagePreviewResponse
)
from app.schemas.triage import TriageInput
from app.services.triage import run_hybrid_triage, more_severe, _evaluate_deterministic_rules, _infer_department
from app.services.queue import get_sorted_waiting_tickets, compute_priority_score
from app.services.eta import calculate_eta_range, get_active_delay_minutes
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/public", tags=["public"])
SAFETY_MSG = "If symptoms are severe or worsening, alert clinic staff now."


def _next_token_code(db: Session, clinic_id: uuid.UUID, urgency: UrgencyTier) -> str:
    prefix = {"RED": "R", "YELLOW": "Y", "GREEN": "G"}.get(urgency.value, "T")
    count = db.query(QueueTicket).filter(QueueTicket.clinic_id == clinic_id).count() + 1
    return f"{prefix}-{count:03d}"


@router.get("/clinics/{slug}", response_model=PublicClinicOut)
def get_public_clinic(slug: str, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.slug == slug, Clinic.is_active.is_(True)).first()
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")

    # Ensure a display token exists for this clinic
    from app.services.display_token import get_or_create_display_token
    display_token = get_or_create_display_token(db, clinic.clinic_id)

    depts = db.query(Department).filter(Department.clinic_id == clinic.clinic_id, Department.is_active.is_(True)).all()
    return PublicClinicOut(
        clinic_id=clinic.clinic_id,
        slug=clinic.slug,
        name=clinic.name,
        public_notice=clinic.public_notice,
        departments=[DepartmentOut(department_id=d.department_id, clinic_id=d.clinic_id, code=d.code, name=d.name) for d in depts],
        display_token=display_token,
    )


@router.post("/clinics/{clinic_id}/intakes", response_model=IntakeCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_qr_intake(clinic_id: uuid.UUID, req: IntakeCreateRequest, db: Session = Depends(get_db)):
    clinic = db.query(Clinic).filter(Clinic.clinic_id == clinic_id, Clinic.is_active.is_(True)).first()
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")

    dept = db.query(Department).filter(
        Department.department_id == req.department_id,
        Department.clinic_id == clinic_id,
        Department.is_active.is_(True),
    ).first()
    if not dept:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid department_id for clinic")

    triage_res = run_hybrid_triage(TriageInput(
        display_name=req.display_name,
        age_years=req.age_years,
        preferred_language=req.preferred_language,
        symptom_text=req.symptom_text,
        input_mode=req.input_mode,
        patient_reported_duration=req.patient_reported_duration,
        department_name=dept.name,
    ))

    selected_card = (req.card_type or "").upper().strip()
    if selected_card in {"RED", "YELLOW", "GREEN"}:
        final_urgency_str = more_severe(triage_res.urgency_tier, selected_card)
        urgency_enum = UrgencyTier(final_urgency_str)
        if selected_card == "RED" and "Patient self-reported severe emergency condition (Emergency RED Card selected)." not in triage_res.red_flag_reasons:
            triage_res.red_flag_reasons.append("Patient self-reported severe emergency condition (Emergency RED Card selected).")
    else:
        urgency_enum = UrgencyTier(triage_res.urgency_tier)

    now = datetime.now(timezone.utc)
    score, _ = compute_priority_score(urgency_enum, now, now=now)

    # Prevent duplicate patient records if CNIC provided
    patient = None
    if req.cnic:
        clean_cnic = req.cnic.strip().replace(" ", "")
        patient = db.query(Patient).filter(Patient.cnic == clean_cnic).first()

    if not patient:
        patient = Patient(
            clinic_id=clinic_id,
            display_name=req.display_name.strip(),
            cnic=req.cnic.strip().replace(" ", "") if req.cnic else None,
            phone_number=req.phone_number.strip() if req.phone_number else None,
            gender=req.gender or "other",
            age_years=req.age_years,
            preferred_language=PreferredLanguage(req.preferred_language),
        )
        db.add(patient)
        db.flush()
    else:
        # Keep patient data up to date
        patient.display_name = req.display_name.strip()
        patient.age_years = req.age_years
        if req.phone_number:
            patient.phone_number = req.phone_number.strip()

    ticket = QueueTicket(
        clinic_id=clinic_id,
        department_id=dept.department_id,
        patient_id=patient.patient_id,
        token_code=_next_token_code(db, clinic_id, urgency_enum),
        status=TicketStatus.WAITING,
        urgency=urgency_enum,
        priority_score=score,
        channel=IntakeChannel.QR,
        checked_in_at=now,
    )
    db.add(ticket)
    db.flush()

    db.add(IntakeRecord(
        ticket_id=ticket.ticket_id,
        symptom_text=req.symptom_text,
        input_mode=InputMode(req.input_mode),
        patient_reported_duration=req.patient_reported_duration,
    ))

    assessment = TriageAssessment(
        ticket_id=ticket.ticket_id,
        clinic_id=clinic_id,
        source=TriageSource(triage_res.source),
        urgency=urgency_enum,
        normalized_symptoms=triage_res.normalized_symptoms,
        red_flag_reasons=triage_res.red_flag_reasons,
        uncertainties=triage_res.uncertainties,
        recommended_department=triage_res.recommended_department,
        doctor_pre_brief=triage_res.doctor_pre_brief,
        model_provider=triage_res.model_provider,
        model_name=triage_res.model_name,
        prompt_version=triage_res.prompt_version,
        rule_set_version=triage_res.rule_set_version,
        input_hash=triage_res.input_hash,
    )
    db.add(assessment)
    db.flush()

    for hit in triage_res.rule_hits:
        db.add(TriageRuleHit(
            triage_assessment_id=assessment.triage_assessment_id,
            rule_code=hit.rule_code,
            rule_version=hit.rule_version,
            evidence=hit.evidence,
        ))

    tracking_str = f"trk_{secrets.token_urlsafe(16)}"
    db.add(PatientTrackingToken(ticket_id=ticket.ticket_id, tracking_token=tracking_str))
    db.add(AuditLog(
        clinic_id=clinic_id,
        entity_type="queue_ticket",
        entity_id=str(ticket.ticket_id),
        action="QR_INTAKE_CREATED",
        details={"urgency": urgency_enum.value, "token_code": ticket.token_code},
    ))
    db.commit()

    sorted_waiting = get_sorted_waiting_tickets(db, clinic_id, dept.department_id)
    ahead = 0
    for idx, (t_item, _, _) in enumerate(sorted_waiting):
        if t_item.ticket_id == ticket.ticket_id:
            ahead = idx
            break

    eta_min, eta_max, eff_pos = calculate_eta_range(db, clinic_id, ahead_count=ahead, department_id=dept.department_id)
    ticket.estimated_wait_minutes = (eta_min + eta_max) // 2
    db.commit()

    card_type = urgency_enum.value
    if card_type == "RED":
        card_title = "🚨 EMERGENCY TRIAGE CARD — IMMEDIATE MEDICAL ATTENTION"
        card_msg = "Critical indicators reported. Clinic emergency staff have been alerted to your token."
    elif card_type == "YELLOW":
        card_title = "⚠️ PRIORITY CARE CARD — ELEVATED TRIAGE"
        card_msg = "Intermediate urgency. You are prioritized ahead of routine checkups."
    else:
        card_title = "✅ ROUTINE CONSULTATION CARD — STANDARD OPD"
        card_msg = "Routine consultation. Your estimated consultation window is calculated below."

    await ws_manager.broadcast_staff(str(clinic_id), {"type": "queue.updated", "clinic_id": str(clinic_id)})
    await ws_manager.broadcast_all_displays_for_clinic(str(clinic_id), {"type": "display.updated", "clinic_id": str(clinic_id)})

    return IntakeCreateResponse(
        ticket=CreatedTicketSummary(
            ticket_id=ticket.ticket_id,
            token_code=ticket.token_code,
            status=ticket.status.value,
            urgency=ticket.urgency.value,
            queue_position=eff_pos,
            eta_min_minutes=eta_min,
            eta_max_minutes=eta_max,
            triage_card_type=card_type,
            triage_card_title=card_title,
            triage_card_message=card_msg,
        ),
        tracking_token=tracking_str,
        safety_message=SAFETY_MSG,
    )


@router.post("/clinics/{clinic_id}/emergency-intake", response_model=IntakeCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_emergency_intake(
    clinic_id: uuid.UUID,
    req: Optional[EmergencyIntakeRequest] = None,
    db: Session = Depends(get_db),
):
    """
    Zero-form One-Click Emergency RED Card endpoint for accidents / critical cases.
    Requires no name, age, CNIC, or symptoms upfront; staff can manually fill details later.
    """
    clinic = db.query(Clinic).filter(Clinic.clinic_id == clinic_id, Clinic.is_active.is_(True)).first()
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")

    depts = db.query(Department).filter(
        Department.clinic_id == clinic_id,
        Department.is_active.is_(True),
    ).all()
    if not depts:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No active department found for clinic")

    # Prefer Emergency / Trauma department if present, else first active department
    dept = next(
        (d for d in depts if "emerg" in d.name.lower() or d.code.upper() in {"EMER", "ER", "TRAUMA"}),
        depts[0],
    )

    now = datetime.now(timezone.utc)
    urgency_enum = UrgencyTier.RED
    token_code = _next_token_code(db, clinic_id, urgency_enum)
    score, _ = compute_priority_score(urgency_enum, now, now=now)
    lang = req.preferred_language if req else "en"

    patient = Patient(
        clinic_id=clinic_id,
        display_name=f"Emergency Case ({token_code})",
        cnic=None,
        phone_number=None,
        gender="other",
        age_years=30,
        preferred_language=PreferredLanguage(lang),
    )
    db.add(patient)
    db.flush()

    ticket = QueueTicket(
        clinic_id=clinic_id,
        department_id=dept.department_id,
        patient_id=patient.patient_id,
        token_code=token_code,
        status=TicketStatus.WAITING,
        urgency=urgency_enum,
        priority_score=score,
        channel=IntakeChannel.QR,
        checked_in_at=now,
    )
    db.add(ticket)
    db.flush()

    note_text = (req.note.strip() if req and req.note else None) or (
        "CRITICAL EMERGENCY — One-Click Emergency RED Card (Accident / Serious Case). "
        "Patient details to be collected manually by staff."
    )
    db.add(IntakeRecord(
        ticket_id=ticket.ticket_id,
        symptom_text=note_text,
        input_mode=InputMode.TEXT,
        patient_reported_duration="Immediate / Sudden",
    ))

    red_reason = "One-Click Emergency RED Card triggered (Accident / Critical Case — Zero-Form Immediate Escalation)."
    assessment = TriageAssessment(
        ticket_id=ticket.ticket_id,
        clinic_id=clinic_id,
        source=TriageSource.RULES,
        urgency=urgency_enum,
        normalized_symptoms=["emergency", "critical", "manual_details_pending"],
        red_flag_reasons=[red_reason],
        uncertainties=["Patient identity and full clinical details pending manual staff entry."],
        recommended_department=dept.name,
        doctor_pre_brief=f"🚨 IMMEDIATE EMERGENCY RED CARD ({token_code}) — Patient arrived via One-Click Emergency. Collect details manually.",
        model_provider="one-click-emergency",
        model_name="emergency-bypass-v1",
        prompt_version="emergency-v1",
        rule_set_version="emergency-v1",
        input_hash=f"emer-{ticket.ticket_id}",
    )
    db.add(assessment)

    tracking_str = f"trk_{secrets.token_urlsafe(16)}"
    db.add(PatientTrackingToken(ticket_id=ticket.ticket_id, tracking_token=tracking_str))
    db.add(AuditLog(
        clinic_id=clinic_id,
        entity_type="queue_ticket",
        entity_id=str(ticket.ticket_id),
        action="EMERGENCY_ONE_CLICK_CREATED",
        details={"urgency": "RED", "token_code": token_code},
    ))
    db.commit()

    sorted_waiting = get_sorted_waiting_tickets(db, clinic_id, dept.department_id)
    ahead = 0
    for idx, (t_item, _, _) in enumerate(sorted_waiting):
        if t_item.ticket_id == ticket.ticket_id:
            ahead = idx
            break

    eta_min, eta_max, eff_pos = calculate_eta_range(db, clinic_id, ahead_count=ahead, department_id=dept.department_id)
    ticket.estimated_wait_minutes = (eta_min + eta_max) // 2
    db.commit()

    await ws_manager.broadcast_staff(str(clinic_id), {"type": "queue.updated", "clinic_id": str(clinic_id)})
    await ws_manager.broadcast_all_displays_for_clinic(str(clinic_id), {"type": "display.updated", "clinic_id": str(clinic_id)})

    return IntakeCreateResponse(
        ticket=CreatedTicketSummary(
            ticket_id=ticket.ticket_id,
            token_code=ticket.token_code,
            status=ticket.status.value,
            urgency=ticket.urgency.value,
            queue_position=eff_pos,
            eta_min_minutes=eta_min,
            eta_max_minutes=eta_max,
            triage_card_type="RED",
            triage_card_title="🚨 EMERGENCY RED CARD — IMMEDIATE ATTENTION",
            triage_card_message="Emergency token issued immediately. Proceed straight to Emergency / Triage desk; staff will record details manually.",
        ),
        tracking_token=tracking_str,
        safety_message=SAFETY_MSG,
    )


@router.post("/triage-preview", response_model=TriagePreviewResponse)
def preview_ai_triage(req: TriagePreviewRequest):
    """Instant smart AI triage preview as patient types symptoms."""
    t_input = TriageInput(
        display_name="Preview",
        age_years=req.age_years,
        preferred_language=req.preferred_language,
        symptom_text=req.symptom_text,
        input_mode="TEXT",
    )
    urgency, reasons, _ = _evaluate_deterministic_rules(t_input)
    rec_dept = _infer_department(req.symptom_text, None)
    if urgency == "RED":
        title = "🚨 RED Card — Critical / Emergency Detected"
    elif urgency == "YELLOW":
        title = "⚠️ YELLOW Card — Urgent / Priority Care"
    else:
        title = "✅ GREEN Card — Routine OPD Consultation"

    return TriagePreviewResponse(
        urgency_tier=urgency,
        card_title=title,
        red_flag_reasons=reasons,
        recommended_department=rec_dept,
    )


@router.get("/tickets/{tracking_token}", response_model=PublicTicketTrackOut)
def track_ticket(tracking_token: str, db: Session = Depends(get_db)):
    tok_row = db.query(PatientTrackingToken).filter(PatientTrackingToken.tracking_token == tracking_token).first()
    if not tok_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tracking token not found")

    ticket = db.query(QueueTicket).filter(QueueTicket.ticket_id == tok_row.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    clinic = db.query(Clinic).filter(Clinic.clinic_id == ticket.clinic_id).first()
    consult = db.query(Consultation).filter(Consultation.ticket_id == ticket.ticket_id).first()
    doctor = db.query(StaffUser).filter(StaffUser.user_id == ticket.doctor_id).first() if ticket.doctor_id else None

    queue_pos = None
    eta_min = None
    eta_max = None

    if ticket.status == TicketStatus.WAITING:
        sorted_waiting = get_sorted_waiting_tickets(db, ticket.clinic_id, ticket.department_id)
        ahead = 0
        for idx, (t_item, _, _) in enumerate(sorted_waiting):
            if t_item.ticket_id == ticket.ticket_id:
                ahead = idx
                break
        eta_min, eta_max, queue_pos = calculate_eta_range(
            db, ticket.clinic_id, ahead_count=ahead, doctor_id=ticket.doctor_id, department_id=ticket.department_id
        )

    card_type = ticket.urgency.value
    if card_type == "RED":
        card_title = "🚨 EMERGENCY TRIAGE CARD"
        card_msg = "Immediate clinical attention required. Please alert clinic triage staff."
    elif card_type == "YELLOW":
        card_title = "⚠️ PRIORITY CARE CARD"
        card_msg = "Elevated triage priority based on symptom severity."
    else:
        card_title = "✅ ROUTINE CONSULTATION CARD"
        card_msg = "Standard outpatient consultation. Wait window estimated below."

    doctor_name = doctor.full_name if doctor else ticket.called_by_doctor_name
    room = ticket.room_number or (doctor.room_number if doctor else None)

    return PublicTicketTrackOut(
        token_code=ticket.token_code,
        status=ticket.status.value,
        urgency=ticket.urgency.value,
        queue_position=queue_pos,
        eta_min_minutes=eta_min,
        eta_max_minutes=eta_max,
        clinic_notice=clinic.public_notice if clinic else "",
        safety_message=SAFETY_MSG,
        updated_at=ticket.updated_at,
        room_number=room,
        called_by_doctor_name=doctor_name,
        clinician_note=consult.clinician_note if consult else None,
        triage_card_type=card_type,
        triage_card_title=card_title,
        triage_card_message=card_msg,
    )


@router.get("/display/{display_token}", response_model=PublicDisplayOut)
def get_public_display(display_token: str, db: Session = Depends(get_db)):
    disp = db.query(DisplayAccessToken).filter(
        DisplayAccessToken.display_token == display_token,
        DisplayAccessToken.is_active.is_(True),
    ).first()
    if not disp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid display token")

    clinic = db.query(Clinic).filter(Clinic.clinic_id == disp.clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")

    active_tickets = db.query(QueueTicket).filter(
        QueueTicket.clinic_id == clinic.clinic_id,
        QueueTicket.status.in_([TicketStatus.CALLED, TicketStatus.IN_CONSULTATION]),
    ).all()
    now_serving = [t.token_code for t in active_tickets]
    now_serving_status = {t.token_code: t.status.value for t in active_tickets}

    waiting_sorted = get_sorted_waiting_tickets(db, clinic.clinic_id)
    next_up = [t.token_code for t, _, _ in waiting_sorted[:6]]

    delay_mins = get_active_delay_minutes(db, clinic.clinic_id)
    clinic_status = f"DELAYED (+{delay_mins}m)" if delay_mins > 0 else "ON TIME"

    return PublicDisplayOut(
        clinic_name=clinic.name,
        now_serving=now_serving,
        now_serving_status=now_serving_status,
        next_up=next_up,
        clinic_status=clinic_status,
        public_notice=clinic.public_notice,
        updated_at=datetime.now(timezone.utc),
    )


@router.get("/clinics/{clinic_id}/live-summary")
def get_public_live_summary(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    """Sanitized real-time queue & consultation summary for the public Hub display."""
    clinic = db.query(Clinic).filter(Clinic.clinic_id == clinic_id, Clinic.is_active.is_(True)).first()
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinic not found")

    depts = {
        d.department_id: d.name
        for d in db.query(Department).filter(Department.clinic_id == clinic_id).all()
    }

    active_tickets = db.query(QueueTicket).filter(
        QueueTicket.clinic_id == clinic_id,
        QueueTicket.status.in_([TicketStatus.IN_CONSULTATION, TicketStatus.CALLED]),
    ).order_by(QueueTicket.updated_at.desc()).all()

    now_serving = [
        {
            "token_code": t.token_code,
            "status": t.status.value,
            "urgency": t.urgency.value,
            "room_number": t.room_number or "Room 101",
            "department_name": depts.get(t.department_id, "General"),
        }
        for t in active_tickets
    ]

    waiting_sorted = get_sorted_waiting_tickets(db, clinic_id)
    queue_items = [
        {
            "token_code": t.token_code,
            "urgency": t.urgency.value,
            "department_name": depts.get(t.department_id, "General"),
            "wait_minutes": wait_mins,
        }
        for t, _, wait_mins in waiting_sorted[:5]
    ]

    completed_count = db.query(QueueTicket).filter(
        QueueTicket.clinic_id == clinic_id,
        QueueTicket.status == TicketStatus.COMPLETED,
    ).count()

    delay_mins = get_active_delay_minutes(db, clinic_id)
    avg_wait = max(5, 12 + delay_mins)

    return {
        "clinic_name": clinic.name,
        "now_serving": now_serving,
        "queue": queue_items,
        "waiting_count": len(waiting_sorted),
        "in_consultation_count": len(active_tickets),
        "completed_count": completed_count,
        "avg_wait_minutes": avg_wait,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }