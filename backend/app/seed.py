import sys
import hashlib
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.core.security import get_password_hash
from app.models.entities import (
    Clinic, Department, StaffUser, ClinicMembership, Patient,
    QueueTicket, IntakeRecord, VitalObservation, TriageAssessment,
    TriageRuleHit, Consultation, ClinicDelay, PatientTrackingToken,
    DisplayAccessToken, UserRole, TicketStatus, UrgencyTier,
    IntakeChannel, InputMode, PreferredLanguage, TriageSource
)


def seed_database(reset: bool = False):
    if reset:
        print("⚠️ Resetting database tables (non-production demo mode)...")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        # Idempotency check
        existing = db.query(Clinic).filter(Clinic.slug == "islamabad-care-clinic").first()
        if existing:
            print("✅ Synthetic seed already exists. Skipping duplicate insertion.")
            print(f"   Clinic Slug: {existing.slug} | Clinic ID: {existing.clinic_id}")
            disp = db.query(DisplayAccessToken).filter(DisplayAccessToken.clinic_id == existing.clinic_id).first()
            if disp:
                print(f"   TV Display Token: {disp.display_token}")
            return

        now = datetime.now(timezone.utc)

        # 1. Clinic
        clinic = Clinic(
            slug="islamabad-care-clinic",
            name="Islamabad Community Care Clinic (Demo)",
            public_notice="Emergency symptoms? Alert reception immediately. Doctor break delay active (+10 mins).",
        )
        db.add(clinic)
        db.flush()

        # 2. Departments (2 departments)
        dept_gp = Department(
            clinic_id=clinic.clinic_id,
            code="GP",
            name="General Medicine & Acute Care",
        )
        dept_peds = Department(
            clinic_id=clinic.clinic_id,
            code="PEDS",
            name="Pediatrics & Family Health",
        )
        db.add_all([dept_gp, dept_peds])
        db.flush()

        # 3. Staff Users (5 synthetic staff members)
        staff_specs = [
            ("admin@mediflow.demo", "Demo Admin Zoya", UserRole.ADMIN, None),
            ("reception@mediflow.demo", "Demo Receptionist Bilal", UserRole.RECEPTIONIST, None),
            ("nurse@mediflow.demo", "Demo Nurse Ayesha", UserRole.NURSE, dept_gp.department_id),
            ("dr.sara@mediflow.demo", "Dr. Sara Ahmed (GP)", UserRole.DOCTOR, dept_gp.department_id),
            ("dr.hamza@mediflow.demo", "Dr. Hamza Tariq (Peds)", UserRole.DOCTOR, dept_peds.department_id),
        ]
        staff_map = {}
        pw_hash = get_password_hash("DemoPass123!")
        for idx, (email, name, role, dept_id) in enumerate(staff_specs, start=1):
            u = StaffUser(
                email=email,
                full_name=name,
                password_hash=pw_hash,
            )
            db.add(u)
            db.flush()
            db.add(ClinicMembership(
                user_id=u.user_id,
                clinic_id=clinic.clinic_id,
                department_id=dept_id,
                role=role,
            ))
            staff_map[role.value + str(idx)] = u

        dr_gp = staff_map["DOCTOR4"]
        dr_peds = staff_map["DOCTOR5"]
        nurse = staff_map["NURSE3"]

        # 4. Display Access Token
        display_tok = DisplayAccessToken(
            clinic_id=clinic.clinic_id,
            display_token="demo-tv-display-token-2026",
            label="Main Waiting Hall Screen",
        )
        db.add(display_tok)

        # 5. Active Clinic Delay
        db.add(ClinicDelay(
            clinic_id=clinic.clinic_id,
            department_id=dept_gp.department_id,
            delay_minutes=10,
            reason="Routine emergency sanitization & doctor handover",
            is_active=True,
            created_by=nurse.user_id,
        ))

        # 6. Historical Completed Consultations (12 per doctor for ETA calibration)
        for doc_idx, doc in enumerate([dr_gp, dr_peds], start=1):
            dept = dept_gp if doc_idx == 1 else dept_peds
            for c_i in range(12):
                p = Patient(
                    clinic_id=clinic.clinic_id,
                    display_name=f"Synthetic History {doc_idx}-{c_i+1:02d}",
                    age_years=25 + (c_i % 30),
                    preferred_language=PreferredLanguage.en,
                )
                db.add(p)
                db.flush()
                t_start = now - timedelta(hours=3, minutes=c_i * 12)
                dur_sec = 540 + (c_i % 5) * 60  # 9 to 13 mins
                t_end = t_start + timedelta(seconds=dur_sec)
                tkt = QueueTicket(
                    clinic_id=clinic.clinic_id,
                    department_id=dept.department_id,
                    patient_id=p.patient_id,
                    doctor_id=doc.user_id,
                    token_code=f"H-{doc_idx}{c_i+1:02d}",
                    status=TicketStatus.COMPLETED,
                    urgency=UrgencyTier.GREEN,
                    priority_score=10,
                    channel=IntakeChannel.WALK_IN,
                    checked_in_at=t_start - timedelta(minutes=15),
                    called_at=t_start - timedelta(minutes=2),
                    consultation_started_at=t_start,
                    completed_at=t_end,
                )
                db.add(tkt)
                db.flush()
                db.add(Consultation(
                    ticket_id=tkt.ticket_id,
                    doctor_id=doc.user_id,
                    started_at=t_start,
                    completed_at=t_end,
                    duration_seconds=dur_sec,
                    clinician_note="Synthetic historical consultation completed.",
                ))

        # 7. Active Queue Tickets: 3 RED, 8 YELLOW, 9 GREEN (20 active synthetic patients)
        active_cases = [
            # 3 RED
            ("Demo Patient 01", 58, PreferredLanguage.ur, "سینے میں شدید درد اور پسینہ آ رہا ہے", ["chest pain", "sweating"], UrgencyTier.RED, ["HARD_RULE_CHEST_PAIN_SWEATING: Chest pain with diaphoresis reported"], 96, 155, 95, 37.1, 118, dept_gp, TicketStatus.WAITING, 12),
            ("Demo Patient 02", 64, PreferredLanguage.en, "Severe shortness of breath and dizziness", ["shortness of breath", "dizziness"], UrgencyTier.RED, ["HARD_RULE_LOW_SPO2: SpO2 89% < 92% threshold (demo rule)"], 89, 142, 88, 37.4, 112, dept_gp, TicketStatus.CALLED, 18),
            ("Demo Patient 03", 29, PreferredLanguage.roman_ur, "Pregnancy mein shadeed sar dard aur bleeding", ["pregnancy headache", "bleeding"], UrgencyTier.RED, ["HARD_RULE_PREGNANCY_ALERT: Pregnancy with bleeding/severe headache"], 97, 165, 102, 37.0, 108, dept_gp, TicketStatus.WAITING, 6),
            # 8 YELLOW
            ("Demo Patient 04", 42, PreferredLanguage.roman_ur, "Tez bukhar aur jism mein dard 3 din se", ["high fever", "body ache"], UrgencyTier.YELLOW, [], 98, 128, 82, 39.1, 96, dept_gp, TicketStatus.IN_CONSULTATION, 35),
            ("Demo Patient 05", 33, PreferredLanguage.en, "Persistent abdominal pain and nausea", ["abdominal pain", "nausea"], UrgencyTier.YELLOW, [], 98, 122, 78, 37.8, 88, dept_gp, TicketStatus.WAITING, 28),
            ("Demo Patient 06", 7, PreferredLanguage.ur, "بچے کو تیز بخار اور کھانسی ہے", ["fever", "cough"], UrgencyTier.YELLOW, [], 97, 105, 68, 38.9, 104, dept_peds, TicketStatus.WAITING, 22),
            ("Demo Patient 07", 51, PreferredLanguage.en, "High blood pressure reading at home and headache", ["headache", "elevated bp"], UrgencyTier.YELLOW, [], 98, 168, 98, 36.9, 86, dept_gp, TicketStatus.WAITING, 19),
            ("Demo Patient 08", 19, PreferredLanguage.roman_ur, "Ankle twist ho gaya hai aur sujan hai", ["ankle swelling", "pain"], UrgencyTier.YELLOW, [], 99, 118, 74, 36.8, 84, dept_gp, TicketStatus.WAITING, 15),
            ("Demo Patient 09", 46, PreferredLanguage.en, "Migraine headache with light sensitivity", ["migraine", "photophobia"], UrgencyTier.YELLOW, [], 98, 130, 84, 36.7, 80, dept_gp, TicketStatus.WAITING, 14),
            ("Demo Patient 10", 11, PreferredLanguage.roman_ur, "Kaan mein shadeed dard aur bukhar", ["ear pain", "fever"], UrgencyTier.YELLOW, [], 98, 110, 70, 38.4, 94, dept_peds, TicketStatus.WAITING, 11),
            ("Demo Patient 11", 38, PreferredLanguage.en, "Moderate asthma wheezing after dust exposure", ["wheezing"], UrgencyTier.YELLOW, [], 94, 126, 80, 37.0, 92, dept_gp, TicketStatus.WAITING, 9),
        ]

        # Add 9 GREEN cases
        for g_i in range(12, 21):
            dept = dept_gp if g_i % 2 == 0 else dept_peds
            active_cases.append((
                f"Demo Patient {g_i:02d}",
                20 + g_i,
                PreferredLanguage.roman_ur,
                "Halka zukam aur gala kharab hai",
                ["mild cold", "sore throat"],
                UrgencyTier.GREEN,
                [],
                99, 120, 80, 36.8, 76,
                dept,
                TicketStatus.WAITING,
                g_i * 2,
            ))

        base_weights = {UrgencyTier.RED: 100, UrgencyTier.YELLOW: 40, UrgencyTier.GREEN: 10}
        prefix_map = {UrgencyTier.RED: "R", UrgencyTier.YELLOW: "Y", UrgencyTier.GREEN: "G"}

        for idx, item in enumerate(active_cases, start=1):
            (name, age, lang, sym_text, norm_syms, urg, reasons,
             spo2, sys_bp, dia_bp, temp_c, pulse, dept, status, wait_mins) = item

            p = Patient(
                clinic_id=clinic.clinic_id,
                display_name=name,
                age_years=age,
                preferred_language=lang,
            )
            db.add(p)
            db.flush()

            aging = min(120, wait_mins // 10)
            score = base_weights[urg] + aging
            checked_in = now - timedelta(minutes=wait_mins)
            assigned_doc = (dr_gp.user_id if dept == dept_gp else dr_peds.user_id) if status in [TicketStatus.CALLED, TicketStatus.IN_CONSULTATION] else None

            tkt = QueueTicket(
                clinic_id=clinic.clinic_id,
                department_id=dept.department_id,
                patient_id=p.patient_id,
                doctor_id=assigned_doc,
                token_code=f"{prefix_map[urg]}-{idx:03d}",
                status=status,
                urgency=urg,
                priority_score=score,
                channel=IntakeChannel.QR if idx % 2 == 0 else IntakeChannel.WALK_IN,
                checked_in_at=checked_in,
                called_at=now - timedelta(minutes=3) if status in [TicketStatus.CALLED, TicketStatus.IN_CONSULTATION] else None,
                consultation_started_at=now - timedelta(minutes=2) if status == TicketStatus.IN_CONSULTATION else None,
                estimated_wait_minutes=15,
            )
            db.add(tkt)
            db.flush()

            db.add(IntakeRecord(
                ticket_id=tkt.ticket_id,
                symptom_text=sym_text,
                input_mode=InputMode.TEXT,
                patient_reported_duration="1-2 days",
            ))

            db.add(VitalObservation(
                ticket_id=tkt.ticket_id,
                systolic_bp=sys_bp,
                diastolic_bp=dia_bp,
                temperature_c=temp_c,
                spo2_percent=spo2,
                pulse_bpm=pulse,
                measured_at=checked_in + timedelta(minutes=2),
                recorded_by=nurse.user_id,
            ))

            assessment = TriageAssessment(
                ticket_id=tkt.ticket_id,
                clinic_id=clinic.clinic_id,
                source=TriageSource.COMBINED,
                urgency=urg,
                normalized_symptoms=norm_syms,
                red_flag_reasons=reasons,
                uncertainties=[],
                recommended_department=dept.name,
                doctor_pre_brief=f"[AI Draft — Verify with patient] {name} ({age}y) reports: {', '.join(norm_syms)}.",
                model_provider="seed-synthetic",
                model_name="deterministic-demo",
                input_hash=hashlib.sha256(sym_text.encode()).hexdigest(),
            )
            db.add(assessment)
            db.flush()

            if reasons:
                db.add(TriageRuleHit(
                    triage_assessment_id=assessment.triage_assessment_id,
                    rule_code="DEMO_SAFETY_RULE",
                    rule_version="demo-rules-v1.0",
                    evidence={"reasons": reasons, "spo2": spo2, "bp": f"{sys_bp}/{dia_bp}"},
                ))

            db.add(PatientTrackingToken(
                ticket_id=tkt.ticket_id,
                tracking_token=f"track-demo-{idx:03d}",
            ))

        db.commit()
        print("🎉 Synthetic seed completed successfully!")
        print("   Clinic Slug: islamabad-care-clinic")
        print("   TV Display Token: demo-tv-display-token-2026")
        print("   Staff Logins (Password: DemoPass123!):")
        print("     - Doctor (GP): dr.sara@mediflow.demo")
        print("     - Reception:   reception@mediflow.demo")
        print("     - Nurse:       nurse@mediflow.demo")
    finally:
        db.close()


if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    seed_database(reset=reset_flag)