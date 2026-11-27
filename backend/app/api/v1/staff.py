import secrets
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import get_password_hash
from app.api.v1.auth import get_current_staff_context, require_roles
from app.models.entities import (
    Clinic, Department, Patient, QueueTicket, IntakeRecord, StaffUser,
    ClinicMembership, VitalObservation, TriageAssessment, TriageRuleHit, Consultation,
    ClinicDelay, PatientTrackingToken, AuditLog,
    UserRole, TicketStatus, UrgencyTier, IntakeChannel, InputMode,
    PreferredLanguage, TriageSource
)
from app.schemas.contracts import (
    WalkInTicketCreateRequest, IntakeCreateResponse, CreatedTicketSummary,
    VitalsCreateRequest, QueueResponseOut, QueueTicketItemOut, VitalsSnapshot,
    TicketActionRequest, DelayCreateRequest, ManualPatientInfoUpdateRequest,
    AdminStaffItemOut, AdminStaffCreateRequest, AdminStaffUpdateRequest
)
from app.schemas.triage import TriageInput
from app.services.triage import run_hybrid_triage, more_severe
from app.services.queue import get_sorted_waiting_tickets, compute_priority_score
from app.services.eta import calculate_eta_range, get_active_delay_minutes
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/staff", tags=["staff"])
SAFETY_MSG = "If symptoms are severe or worsening, alert clinic staff now."

VALID_TRANSITIONS: dict[TicketStatus, set[TicketStatus]] = {
    TicketStatus.WAITING: {TicketStatus.CALLED, TicketStatus.ON_HOLD, TicketStatus.CANCELLED, TicketStatus.NO_SHOW},
    TicketStatus.CALLED: {TicketStatus.IN_CONSULTATION, TicketStatus.WAITING, TicketStatus.NO_SHOW, TicketStatus.CANCELLED},
    TicketStatus.IN_CONSULTATION: {TicketStatus.COMPLETED},
    TicketStatus.ON_HOLD: {TicketStatus.WAITING, TicketStatus.CANCELLED},
    TicketStatus.COMPLETED: set(),
    TicketStatus.CANCELLED: set(),
    TicketStatus.NO_SHOW: set(),
}


def _assert_same_clinic(ctx: dict, clinic_id: int):
    if ctx["clinic_id"] != clinic_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden for this clinic")


def _build_ticket_item(db: Session, ticket: QueueTicket, ahead_count: int = 0) -> QueueTicketItemOut:
    _, wait_mins = compute_priority_score(ticket.urgency, ticket.checked_in_at)
    latest_triage = (
        db.query(TriageAssessment)
        .filter(TriageAssessment.ticket_id == ticket.ticket_id)
        .order_by(TriageAssessment.created_at.desc())
        .first()
    )
    latest_vitals = (
        db.query(VitalObservation)
        .filter(VitalObservation.ticket_id == ticket.ticket_id)
        .order_by(VitalObservation.measured_at.desc())
        .first()
    )
    patient = db.query(Patient).filter(Patient.patient_id == ticket.patient_id).first()
    doctor = db.query(StaffUser).filter(StaffUser.user_id == ticket.doctor_id).first() if ticket.doctor_id else None
    dept = db.query(Department).filter(Department.department_id == ticket.department_id).first() if ticket.department_id else None

    eta_min, eta_max, _ = calculate_eta_range(
        db,
        ticket.clinic_id,
        ahead_count=ahead_count if ticket.status == TicketStatus.WAITING else 0,
        doctor_id=ticket.doctor_id,
        department_id=ticket.department_id,
    )
    return QueueTicketItemOut(
        ticket_id=ticket.ticket_id,
        patient_id=ticket.patient_id,
        doctor_id=ticket.doctor_id,
        department_id=ticket.department_id,
        token_code=ticket.token_code,
        status=ticket.status.value,
        urgency=ticket.urgency.value,
        priority_score=ticket.priority_score,
        wait_minutes=wait_mins,
        normalized_symptoms=latest_triage.normalized_symptoms if latest_triage else [],
        red_flag_reasons=latest_triage.red_flag_reasons if latest_triage else [],
        doctor_pre_brief=latest_triage.doctor_pre_brief if latest_triage else "No triage assessment yet.",
        vitals=VitalsSnapshot(
            systolic_bp=latest_vitals.systolic_bp if latest_vitals else None,
            diastolic_bp=latest_vitals.diastolic_bp if latest_vitals else None,
            temperature_c=latest_vitals.temperature_c if latest_vitals else None,
            spo2_percent=latest_vitals.spo2_percent if latest_vitals else None,
            pulse_bpm=latest_vitals.pulse_bpm if latest_vitals else None,
        ),
        eta_min_minutes=eta_min,
        eta_max_minutes=eta_max,
        room_number=ticket.room_number or (doctor.room_number if doctor else None),
        called_by_doctor_name=ticket.called_by_doctor_name or (doctor.full_name if doctor else None),
        patient_name=patient.display_name if patient else "Patient",
        patient_cnic=patient.cnic if patient else None,
        patient_phone=patient.phone_number if patient else None,
        department_name=dept.name if dept else None,
        triage_card_type=ticket.urgency.value,
    )


@router.post("/tickets", response_model=IntakeCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_walkin_ticket(
    req: WalkInTicketCreateRequest,
    ctx: dict = Depends(require_roles({UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.NURSE})),
    db: Session = Depends(get_db),
):
    _assert_same_clinic(ctx, req.clinic_id)
    dept = db.query(Department).filter(Department.department_id == req.department_id, Department.clinic_id == req.clinic_id).first()
    if not dept:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Department not found in clinic")

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
        final_urg = more_severe(triage_res.urgency_tier, selected_card)
        urgency_enum = UrgencyTier(final_urg)
        if selected_card == "RED" and "Staff designated patient as Emergency (RED Card)." not in triage_res.red_flag_reasons:
            triage_res.red_flag_reasons.append("Staff designated patient as Emergency (RED Card).")
    else:
        urgency_enum = UrgencyTier(triage_res.urgency_tier)

    now = datetime.now(timezone.utc)
    score, _ = compute_priority_score(urgency_enum, now, now=now)

    # Link to existing patient by CNIC if provided, else create new
    clean_cnic = req.cnic.strip().replace(" ", "") if req.cnic else None
    patient = None
    if clean_cnic:
        patient = db.query(Patient).filter(Patient.cnic == clean_cnic).first()

    if not patient:
        patient = Patient(
            clinic_id=req.clinic_id,
            display_name=req.display_name.strip(),
            cnic=clean_cnic,
            phone_number=req.phone_number.strip() if req.phone_number else None,
            age_years=req.age_years,
            preferred_language=PreferredLanguage(req.preferred_language),
        )
        db.add(patient)
        db.flush()
    else:
        patient.display_name = req.display_name.strip()
        patient.age_years = req.age_years
        if req.phone_number:
            patient.phone_number = req.phone_number.strip()

    count = db.query(QueueTicket).filter(QueueTicket.clinic_id == req.clinic_id).count() + 1
    prefix = {"RED": "R", "YELLOW": "Y", "GREEN": "G"}[urgency_enum.value]
    ticket = QueueTicket(
        clinic_id=req.clinic_id,
        department_id=dept.department_id,
        patient_id=patient.patient_id,
        token_code=f"{prefix}-{count:03d}",
        status=TicketStatus.WAITING,
        urgency=urgency_enum,
        priority_score=score,
        channel=IntakeChannel.WALK_IN,
        checked_in_at=now,
        created_by=ctx["user_id"],
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
        clinic_id=req.clinic_id,
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
    db.commit()

    eta_min, eta_max, eff_pos = calculate_eta_range(db, req.clinic_id, ahead_count=0, department_id=dept.department_id)
    await ws_manager.broadcast_staff(str(req.clinic_id), {"type": "queue.updated", "clinic_id": str(req.clinic_id)})

    return IntakeCreateResponse(
        ticket=CreatedTicketSummary(
            ticket_id=ticket.ticket_id,
            token_code=ticket.token_code,
            status=ticket.status.value,
            urgency=ticket.urgency.value,
            queue_position=eff_pos,
            eta_min_minutes=eta_min,
            eta_max_minutes=eta_max,
        ),
        tracking_token=tracking_str,
        safety_message=SAFETY_MSG,
    )


@router.post("/tickets/{ticket_id}/vitals", response_model=QueueTicketItemOut)
async def record_vitals(
    ticket_id: int,
    req: VitalsCreateRequest,
    ctx: dict = Depends(require_roles({UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.NURSE, UserRole.DOCTOR})),
    db: Session = Depends(get_db),
):
    ticket = db.query(QueueTicket).filter(QueueTicket.ticket_id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    _assert_same_clinic(ctx, ticket.clinic_id)

    patient = db.query(Patient).filter(Patient.patient_id == ticket.patient_id).first()
    intake = db.query(IntakeRecord).filter(IntakeRecord.ticket_id == ticket.ticket_id).first()
    prev_triage = (
        db.query(TriageAssessment)
        .filter(TriageAssessment.ticket_id == ticket.ticket_id)
        .order_by(TriageAssessment.created_at.desc())
        .first()
    )

    vital = VitalObservation(
        ticket_id=ticket.ticket_id,
        systolic_bp=req.systolic_bp,
        diastolic_bp=req.diastolic_bp,
        temperature_c=req.temperature_c,
        spo2_percent=req.spo2_percent,
        pulse_bpm=req.pulse_bpm,
        measured_at=req.measured_at or datetime.now(timezone.utc),
        recorded_by=ctx["user_id"],
    )
    db.add(vital)

    triage_res = run_hybrid_triage(TriageInput(
        display_name=patient.display_name if patient else "Patient",
        age_years=patient.age_years if patient else 30,
        preferred_language=patient.preferred_language.value if patient else "en",
        symptom_text=intake.symptom_text if intake else "vitals recorded",
        input_mode=intake.input_mode.value if intake else "TEXT",
        patient_reported_duration=intake.patient_reported_duration if intake else None,
        systolic_bp=req.systolic_bp,
        diastolic_bp=req.diastolic_bp,
        temperature_c=req.temperature_c,
        spo2_percent=req.spo2_percent,
        pulse_bpm=req.pulse_bpm,
    ))

    prev_urg: UrgencyTier = ticket.urgency
    new_urg_str = more_severe(prev_urg.value, triage_res.urgency_tier)
    new_urg = UrgencyTier(new_urg_str)
    ticket.urgency = new_urg
    score, _ = compute_priority_score(new_urg, ticket.checked_in_at)
    ticket.priority_score = score

    merged_reasons = list(dict.fromkeys((prev_triage.red_flag_reasons if prev_triage else []) + triage_res.red_flag_reasons))
    assessment = TriageAssessment(
        ticket_id=ticket.ticket_id,
        clinic_id=ticket.clinic_id,
        source=TriageSource.COMBINED if triage_res.rule_hits else TriageSource(triage_res.source),
        urgency=new_urg,
        normalized_symptoms=triage_res.normalized_symptoms,
        red_flag_reasons=merged_reasons,
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

    db.commit()
    await ws_manager.broadcast_staff(str(ticket.clinic_id), {"type": "queue.updated", "clinic_id": str(ticket.clinic_id)})
    return _build_ticket_item(db, ticket, ahead_count=0)


@router.get("/clinics/{clinic_id}/queue", response_model=QueueResponseOut)
def get_clinic_queue(
    clinic_id: int,
    department_id: Optional[int] = Query(default=None),
    ctx: dict = Depends(get_current_staff_context),
    db: Session = Depends(get_db),
):
    _assert_same_clinic(ctx, clinic_id)
    # Doctors & Nurses only see patients from their assigned department
    effective_dept_id = department_id
    if ctx["role"] in {UserRole.DOCTOR, UserRole.NURSE} and ctx.get("department_id") is not None:
        effective_dept_id = ctx["department_id"]

    waiting_sorted = get_sorted_waiting_tickets(db, clinic_id, effective_dept_id)
    waiting_ids = {t.ticket_id for t, _, _ in waiting_sorted}

    q = db.query(QueueTicket).filter(QueueTicket.clinic_id == clinic_id)
    if effective_dept_id is not None:
        q = q.filter(QueueTicket.department_id == effective_dept_id)
    if ctx["role"] == UserRole.DOCTOR:
        q = q.filter((QueueTicket.doctor_id == ctx["user_id"]) | (QueueTicket.doctor_id.is_(None)))
    all_tickets = q.all()

    ahead_map = {t.ticket_id: idx for idx, (t, _, _) in enumerate(waiting_sorted)}
    items: List[QueueTicketItemOut] = []
    for t in all_tickets:
        if t.status in {TicketStatus.CANCELLED, TicketStatus.COMPLETED}:
            continue
        score, _ = compute_priority_score(t.urgency, t.checked_in_at)
        t.priority_score = score
        items.append(_build_ticket_item(db, t, ahead_count=ahead_map.get(t.ticket_id, 0)))

    # Order active: CALLED/IN_CONSULTATION first, then WAITING by priority_score DESC, checked_in_at ASC
    status_rank = {TicketStatus.IN_CONSULTATION.value: 0, TicketStatus.CALLED.value: 1, TicketStatus.WAITING.value: 2, TicketStatus.ON_HOLD.value: 3, TicketStatus.NO_SHOW.value: 4}
    items.sort(key=lambda x: (status_rank.get(x.status, 9), -x.priority_score, x.ticket_id))

    return QueueResponseOut(
        generated_at=datetime.now(timezone.utc),
        active_delay_minutes=get_active_delay_minutes(db, clinic_id, effective_dept_id),
        tickets=items,
    )


@router.get("/tickets/{ticket_id}", response_model=QueueTicketItemOut)
def get_ticket_detail(
    ticket_id: int,
    ctx: dict = Depends(get_current_staff_context),
    db: Session = Depends(get_db),
):
    ticket = db.query(QueueTicket).filter(QueueTicket.ticket_id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    _assert_same_clinic(ctx, ticket.clinic_id)
    return _build_ticket_item(db, ticket, ahead_count=0)


@router.patch("/tickets/{ticket_id}/patient-info", response_model=QueueTicketItemOut)
async def update_ticket_patient_info(
    ticket_id: int,
    req: ManualPatientInfoUpdateRequest,
    ctx: dict = Depends(require_roles({UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.NURSE, UserRole.DOCTOR})),
    db: Session = Depends(get_db),
):
    """
    Allows staff to manually fill or update patient details (Name, Age, CNIC, Phone, Symptoms)
    for Emergency RED Card or Walk-In tickets.
    """
    ticket = db.query(QueueTicket).filter(QueueTicket.ticket_id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    _assert_same_clinic(ctx, ticket.clinic_id)

    patient = db.query(Patient).filter(Patient.patient_id == ticket.patient_id).first()
    clean_cnic = req.cnic.strip().replace(" ", "") if req.cnic else None

    if clean_cnic:
        existing_patient = db.query(Patient).filter(Patient.cnic == clean_cnic).first()
        if existing_patient and existing_patient.patient_id != ticket.patient_id:
            # Link ticket to existing registered patient so it shows up in their portal
            ticket.patient_id = existing_patient.patient_id
            patient = existing_patient

    if patient:
        if req.display_name is not None and req.display_name.strip():
            patient.display_name = req.display_name.strip()
        if req.age_years is not None:
            patient.age_years = req.age_years
        if clean_cnic:
            patient.cnic = clean_cnic
        if req.phone_number is not None and req.phone_number.strip():
            patient.phone_number = req.phone_number.strip()

    if req.department_id is not None:
        dept = db.query(Department).filter(
            Department.department_id == req.department_id,
            Department.clinic_id == ticket.clinic_id,
        ).first()
        if dept:
            ticket.department_id = dept.department_id

    if req.symptom_text is not None and req.symptom_text.strip():
        intake = db.query(IntakeRecord).filter(IntakeRecord.ticket_id == ticket.ticket_id).first()
        if intake:
            intake.symptom_text = req.symptom_text.strip()
        else:
            db.add(IntakeRecord(
                ticket_id=ticket.ticket_id,
                symptom_text=req.symptom_text.strip(),
                input_mode=InputMode.TEXT,
            ))

        triage_res = run_hybrid_triage(TriageInput(
            display_name=patient.display_name if patient else "Patient",
            age_years=patient.age_years if patient else 30,
            preferred_language=patient.preferred_language.value if patient else "en",
            symptom_text=req.symptom_text.strip(),
            input_mode="TEXT",
        ))
        # Never downgrade an emergency RED card
        new_urg = UrgencyTier(more_severe(ticket.urgency.value, triage_res.urgency_tier))
        ticket.urgency = new_urg
        score, _ = compute_priority_score(new_urg, ticket.checked_in_at)
        ticket.priority_score = score

        db.add(TriageAssessment(
            ticket_id=ticket.ticket_id,
            clinic_id=ticket.clinic_id,
            source=TriageSource(triage_res.source),
            urgency=new_urg,
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
        ))

    db.add(AuditLog(
        clinic_id=ticket.clinic_id,
        actor_user_id=ctx["user_id"],
        entity_type="queue_ticket",
        entity_id=str(ticket.ticket_id),
        action="MANUAL_PATIENT_INFO_UPDATED",
        details={"token_code": ticket.token_code},
    ))
    db.commit()
    await ws_manager.broadcast_staff(str(ticket.clinic_id), {"type": "queue.updated", "clinic_id": str(ticket.clinic_id)})
    await ws_manager.broadcast_all_displays_for_clinic(str(ticket.clinic_id), {"type": "display.updated", "clinic_id": str(ticket.clinic_id)})
    return _build_ticket_item(db, ticket, ahead_count=0)


def _transition_ticket(
    db: Session,
    ticket: QueueTicket,
    target_status: TicketStatus,
    ctx: dict,
    req: Optional[TicketActionRequest] = None,
):
    allowed = VALID_TRANSITIONS.get(ticket.status, set())
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invalid status transition from {ticket.status.value} to {target_status.value}",
        )

    now = datetime.now(timezone.utc)
    if target_status == TicketStatus.CALLED:
        if ctx["role"] == UserRole.DOCTOR:
            ticket.doctor_id = ctx["user_id"]
        ticket.called_at = now
        doc = db.query(StaffUser).filter(StaffUser.user_id == ctx["user_id"]).first()
        if doc:
            ticket.called_by_doctor_name = doc.full_name
            ticket.room_number = (req.room_number if (req and req.room_number) else doc.room_number) or "Room 101"
    elif target_status == TicketStatus.IN_CONSULTATION:
        if ctx["role"] == UserRole.DOCTOR:
            ticket.doctor_id = ctx["user_id"]
        elif ticket.doctor_id is None:
            ticket.doctor_id = ctx["user_id"]
        ticket.consultation_started_at = now
        doc = db.query(StaffUser).filter(StaffUser.user_id == ticket.doctor_id).first()
        if doc and not ticket.called_by_doctor_name:
            ticket.called_by_doctor_name = doc.full_name
            ticket.room_number = doc.room_number or "Room 101"
        existing_c = db.query(Consultation).filter(Consultation.ticket_id == ticket.ticket_id).first()
        if not existing_c:
            db.add(Consultation(ticket_id=ticket.ticket_id, doctor_id=ticket.doctor_id, started_at=now))
    elif target_status == TicketStatus.COMPLETED:
        if req and req.doctor_id is not None and req.doctor_id != ctx["user_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="doctor_id must match authenticated staff user",
            )
        if ctx["role"] != UserRole.DOCTOR and ctx["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only DOCTOR can complete consultation")

        doc_uuid = ticket.doctor_id or ctx["user_id"]
        ticket.doctor_id = doc_uuid
        ticket.completed_at = now
        start_ts = ticket.consultation_started_at or ticket.called_at or ticket.checked_in_at
        if start_ts.tzinfo is None:
            start_ts = start_ts.replace(tzinfo=timezone.utc)
        dur_secs = max(1, int((now - start_ts).total_seconds()))

        consult = db.query(Consultation).filter(Consultation.ticket_id == ticket.ticket_id).first()
        if consult:
            consult.doctor_id = doc_uuid
            consult.completed_at = now
            consult.duration_seconds = dur_secs
            if req:
                if req.clinician_note is not None:
                    consult.clinician_note = req.clinician_note
                if req.diagnosis is not None:
                    consult.diagnosis = req.diagnosis
                if req.prescription_medicines is not None:
                    consult.prescription_medicines = req.prescription_medicines
                if req.lab_tests is not None:
                    consult.lab_tests = req.lab_tests
                if req.advice is not None:
                    consult.advice = req.advice
                if req.follow_up is not None:
                    consult.follow_up = req.follow_up
        else:
            db.add(Consultation(
                ticket_id=ticket.ticket_id,
                doctor_id=doc_uuid,
                started_at=start_ts,
                completed_at=now,
                duration_seconds=dur_secs,
                clinician_note=req.clinician_note if req else None,
                diagnosis=req.diagnosis if req else None,
                prescription_medicines=req.prescription_medicines if req else None,
                lab_tests=req.lab_tests if req else None,
                advice=req.advice if req else None,
                follow_up=req.follow_up if req else None,
            ))

    ticket.status = target_status
    db.add(AuditLog(
        clinic_id=ticket.clinic_id,
        actor_user_id=ctx["user_id"],
        entity_type="queue_ticket",
        entity_id=str(ticket.ticket_id),
        action=f"STATUS_{target_status.value}",
        details={"token_code": ticket.token_code},
    ))
    db.commit()


@router.post("/tickets/{ticket_id}/call", response_model=QueueTicketItemOut)
async def call_ticket(
    ticket_id: int,
    req: Optional[TicketActionRequest] = None,
    ctx: dict = Depends(require_roles({UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST, UserRole.ADMIN})),
    db: Session = Depends(get_db),
):
    ticket = db.query(QueueTicket).filter(QueueTicket.ticket_id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    _assert_same_clinic(ctx, ticket.clinic_id)
    _transition_ticket(db, ticket, TicketStatus.CALLED, ctx, req)

    # Realtime notification to patient's live screen
    tok_row = db.query(PatientTrackingToken).filter(PatientTrackingToken.ticket_id == ticket.ticket_id).first()
    if tok_row:
        await ws_manager.broadcast_ticket(tok_row.tracking_token, {
            "type": "ticket.called",
            "token_code": ticket.token_code,
            "status": "CALLED",
            "room_number": ticket.room_number,
            "doctor_name": ticket.called_by_doctor_name,
            "message": f"Token {ticket.token_code} called! Please proceed to {ticket.room_number or 'Doctor Room'}.",
        })

    await ws_manager.broadcast_staff(str(ticket.clinic_id), {"type": "consultation.called", "ticket_id": str(ticket.ticket_id)})
    await ws_manager.broadcast_all_displays_for_clinic(str(ticket.clinic_id), {"type": "display.updated", "clinic_id": str(ticket.clinic_id)})
    return _build_ticket_item(db, ticket)


@router.post("/tickets/{ticket_id}/start", response_model=QueueTicketItemOut)
async def start_ticket(
    ticket_id: int,
    req: Optional[TicketActionRequest] = None,
    ctx: dict = Depends(require_roles({UserRole.DOCTOR, UserRole.NURSE, UserRole.ADMIN})),
    db: Session = Depends(get_db),
):
    ticket = db.query(QueueTicket).filter(QueueTicket.ticket_id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    _assert_same_clinic(ctx, ticket.clinic_id)
    _transition_ticket(db, ticket, TicketStatus.IN_CONSULTATION, ctx, req)

    tok_row = db.query(PatientTrackingToken).filter(PatientTrackingToken.ticket_id == ticket.ticket_id).first()
    if tok_row:
        await ws_manager.broadcast_ticket(tok_row.tracking_token, {
            "type": "ticket.started",
            "token_code": ticket.token_code,
            "status": "IN_CONSULTATION",
            "room_number": ticket.room_number,
            "doctor_name": ticket.called_by_doctor_name,
            "message": f"Consultation in progress with {ticket.called_by_doctor_name or 'Doctor'} in {ticket.room_number or 'Room'}.",
        })

    await ws_manager.broadcast_staff(str(ticket.clinic_id), {"type": "queue.updated", "ticket_id": str(ticket.ticket_id)})
    await ws_manager.broadcast_all_displays_for_clinic(str(ticket.clinic_id), {"type": "display.updated", "clinic_id": str(ticket.clinic_id)})
    return _build_ticket_item(db, ticket)


@router.post("/tickets/{ticket_id}/complete", response_model=QueueTicketItemOut)
async def complete_ticket(
    ticket_id: int,
    req: TicketActionRequest,
    ctx: dict = Depends(require_roles({UserRole.DOCTOR, UserRole.ADMIN})),
    db: Session = Depends(get_db),
):
    ticket = db.query(QueueTicket).filter(QueueTicket.ticket_id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    _assert_same_clinic(ctx, ticket.clinic_id)
    _transition_ticket(db, ticket, TicketStatus.COMPLETED, ctx, req)

    tok_row = db.query(PatientTrackingToken).filter(PatientTrackingToken.ticket_id == ticket.ticket_id).first()
    if tok_row:
        await ws_manager.broadcast_ticket(tok_row.tracking_token, {
            "type": "ticket.completed",
            "token_code": ticket.token_code,
            "status": "COMPLETED",
            "clinician_note": req.clinician_note,
            "message": "Consultation completed. You have been checked out. Thank you!",
        })

    await ws_manager.broadcast_staff(str(ticket.clinic_id), {"type": "consultation.completed", "ticket_id": str(ticket.ticket_id)})
    await ws_manager.broadcast_all_displays_for_clinic(str(ticket.clinic_id), {"type": "display.updated", "clinic_id": str(ticket.clinic_id)})
    return _build_ticket_item(db, ticket)


@router.post("/clinics/{clinic_id}/delay")
async def update_clinic_delay(
    clinic_id: int,
    req: DelayCreateRequest,
    ctx: dict = Depends(require_roles({UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.NURSE, UserRole.DOCTOR})),
    db: Session = Depends(get_db),
):
    _assert_same_clinic(ctx, clinic_id)
    # Deactivate prior delays for scope if setting new active delay
    db.query(ClinicDelay).filter(ClinicDelay.clinic_id == clinic_id, ClinicDelay.department_id == req.department_id).update({"is_active": False})
    delay = ClinicDelay(
        clinic_id=clinic_id,
        department_id=req.department_id,
        delay_minutes=req.delay_minutes,
        reason=req.reason,
        is_active=req.is_active,
        created_by=ctx["user_id"],
    )
    db.add(delay)
    db.commit()
    await ws_manager.broadcast_staff(str(clinic_id), {"type": "display.updated", "clinic_id": str(clinic_id)})
    return {"status": "ok", "delay_id": str(delay.delay_id), "delay_minutes": delay.delay_minutes, "is_active": delay.is_active}


# --- Admin Staff Management (Doctors, Nurses, Receptionists) ---
def _build_staff_item(db: Session, user: StaffUser, membership: ClinicMembership) -> AdminStaffItemOut:
    dept_name = None
    if membership.department_id:
        dept = db.query(Department).filter(Department.department_id == membership.department_id).first()
        if dept:
            dept_name = f"{dept.name} ({dept.code})"
    return AdminStaffItemOut(
        user_id=user.user_id,
        full_name=user.full_name,
        email=user.email,
        role=membership.role.value,
        department_id=membership.department_id,
        department_name=dept_name,
        specialization=user.specialization,
        degrees=user.degrees,
        license_number=user.license_number,
        room_number=user.room_number,
        phone_number=user.phone_number,
        is_active=user.is_active,
        is_present=bool(getattr(user, "is_present", True)),
    )


@router.get("/clinics/{clinic_id}/staff", response_model=List[AdminStaffItemOut])
def list_clinic_staff(
    clinic_id: int,
    ctx: dict = Depends(require_roles({UserRole.ADMIN})),
    db: Session = Depends(get_db),
):
    _assert_same_clinic(ctx, clinic_id)
    rows = (
        db.query(StaffUser, ClinicMembership)
        .join(ClinicMembership, StaffUser.user_id == ClinicMembership.user_id)
        .filter(ClinicMembership.clinic_id == clinic_id)
        .order_by(StaffUser.user_id.asc())
        .all()
    )
    return [_build_staff_item(db, user, membership) for user, membership in rows]


@router.post("/clinics/{clinic_id}/staff", response_model=AdminStaffItemOut, status_code=status.HTTP_201_CREATED)
def create_clinic_staff(
    clinic_id: int,
    req: AdminStaffCreateRequest,
    ctx: dict = Depends(require_roles({UserRole.ADMIN})),
    db: Session = Depends(get_db),
):
    _assert_same_clinic(ctx, clinic_id)
    clean_email = req.email.strip().lower()
    if db.query(StaffUser).filter(StaffUser.email == clean_email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered for another staff user.")

    if req.user_id is not None:
        if db.query(StaffUser).filter(StaffUser.user_id == req.user_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Staff ID {req.user_id} is already in use.")

    if req.department_id is not None:
        dept = db.query(Department).filter(
            Department.department_id == req.department_id,
            Department.clinic_id == clinic_id,
        ).first()
        if not dept:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid department_id for this clinic.")

    staff_kwargs = dict(
        email=clean_email,
        full_name=req.full_name.strip(),
        password_hash=get_password_hash(req.password),
        specialization=req.specialization.strip() if req.specialization else None,
        degrees=req.degrees.strip() if req.degrees else None,
        license_number=req.license_number.strip() if req.license_number else None,
        room_number=req.room_number.strip() if req.room_number else None,
        phone_number=req.phone_number.strip() if req.phone_number else None,
        is_active=True,
    )
    if req.user_id is not None:
        staff_kwargs["user_id"] = req.user_id

    user = StaffUser(**staff_kwargs)
    db.add(user)
    db.flush()

    if req.user_id is not None and db.bind and db.bind.dialect.name == "postgresql":
        db.execute(
            text("SELECT setval(pg_get_serial_sequence('staff_users', 'user_id'), COALESCE((SELECT MAX(user_id) FROM staff_users), 1))")
        )

    membership = ClinicMembership(
        user_id=user.user_id,
        clinic_id=clinic_id,
        department_id=req.department_id,
        role=UserRole(req.role),
    )
    db.add(membership)
    db.commit()
    db.refresh(user)
    db.refresh(membership)
    return _build_staff_item(db, user, membership)


@router.patch("/clinics/{clinic_id}/staff/{user_id}", response_model=AdminStaffItemOut)
def update_clinic_staff(
    clinic_id: int,
    user_id: int,
    req: AdminStaffUpdateRequest,
    ctx: dict = Depends(require_roles({UserRole.ADMIN})),
    db: Session = Depends(get_db),
):
    _assert_same_clinic(ctx, clinic_id)
    membership = (
        db.query(ClinicMembership)
        .filter(ClinicMembership.clinic_id == clinic_id, ClinicMembership.user_id == user_id)
        .first()
    )
    user = db.query(StaffUser).filter(StaffUser.user_id == user_id).first()
    if not membership or not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found in this clinic.")

    if req.email is not None:
        clean_email = req.email.strip().lower()
        existing = db.query(StaffUser).filter(StaffUser.email == clean_email, StaffUser.user_id != user_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already used by another staff member.")
        user.email = clean_email
    if req.full_name is not None:
        user.full_name = req.full_name.strip()
    if req.password is not None:
        user.password_hash = get_password_hash(req.password)
    if req.specialization is not None:
        user.specialization = req.specialization.strip() or None
    if req.degrees is not None:
        user.degrees = req.degrees.strip() or None
    if req.license_number is not None:
        user.license_number = req.license_number.strip() or None
    if req.room_number is not None:
        user.room_number = req.room_number.strip() or None
    if req.phone_number is not None:
        user.phone_number = req.phone_number.strip() or None
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.is_present is not None:
        user.is_present = req.is_present
    if req.role is not None:
        membership.role = UserRole(req.role)
    if "department_id" in req.model_fields_set:
        if req.department_id is not None:
            dept = db.query(Department).filter(
                Department.department_id == req.department_id,
                Department.clinic_id == clinic_id,
            ).first()
            if not dept:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid department_id for this clinic.")
        membership.department_id = req.department_id

    db.commit()
    db.refresh(user)
    db.refresh(membership)
    return _build_staff_item(db, user, membership)


@router.delete("/clinics/{clinic_id}/staff/{user_id}")
def delete_clinic_staff(
    clinic_id: int,
    user_id: int,
    ctx: dict = Depends(require_roles({UserRole.ADMIN})),
    db: Session = Depends(get_db),
):
    _assert_same_clinic(ctx, clinic_id)
    if ctx["user_id"] == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own admin account.")
    membership = (
        db.query(ClinicMembership)
        .filter(ClinicMembership.clinic_id == clinic_id, ClinicMembership.user_id == user_id)
        .first()
    )
    user = db.query(StaffUser).filter(StaffUser.user_id == user_id).first()
    if not membership or not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found in this clinic.")

    db.delete(membership)
    db.delete(user)
    db.commit()
    return {"status": "deleted", "user_id": user_id}