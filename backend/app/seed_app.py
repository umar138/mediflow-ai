import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
import uuid
from faker import Faker
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.entities import (
    Clinic,
    Department,
    StaffUser,
    ClinicMembership,
    Patient,
    UserRole,
    QueueTicket,
    PatientTrackingToken,
    DisplayAccessToken,
)
from app.services.display_token import get_or_create_display_token


fake = Faker()


def seed_clinic(db: Session) -> Clinic:
    """Create a demo clinic with slug 'mediflow-demo' if it does not exist and return it.
    This ensures the public endpoint can locate the expected clinic.
    """
    # Try to fetch by the expected slug
    clinic = db.query(Clinic).filter(Clinic.slug == "mediflow-demo").first()
    if clinic:
        return clinic
    # If there is any other active clinic, rename its slug to the demo slug
    existing = db.query(Clinic).filter(Clinic.is_active.is_(True)).first()
    if existing:
        existing.slug = "mediflow-demo"
        db.commit()
        db.refresh(existing)
        # Ensure display token exists
        get_or_create_display_token(db, existing.clinic_id)
        return existing
    # Otherwise create a fresh demo clinic
    clinic = Clinic(
        slug="mediflow-demo",
        name="MediFlow Demo Clinic",
        public_notice="Welcome to MediFlow Demo Clinic.",
        is_active=True,
    )
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    get_or_create_display_token(db, clinic.clinic_id)
    return clinic


def seed_departments(db: Session, clinic: Clinic) -> list[Department]:
    existing = db.query(Department).filter(Department.clinic_id == clinic.clinic_id).all()
    if existing:
        return existing
    depts_data = [
        {"code": "CARD", "name": "Cardiology"},
        {"code": "ORTHO", "name": "Orthopedics"},
        {"code": "DERM", "name": "Dermatology"},
        {"code": "GP", "name": "General Practice"},
    ]
    depts = []
    for d in depts_data:
        dept = Department(
            clinic_id=clinic.clinic_id,
            code=d["code"],
            name=d["name"],
            floor_or_wing="Ground Floor",
            is_active=True,
        )
        db.add(dept)
        depts.append(dept)
    db.commit()
    for d in depts:
        db.refresh(d)
    return depts


def seed_demo_staff(db: Session, clinic: Clinic, departments: list[Department]) -> None:
    """Create fixed demo staff accounts (receptionist & doctor) if they don't exist.
    They are linked to the clinic and appropriate departments.
    """
    # Receptionist
    reception_email = "reception@mediflow.demo"
    reception = db.query(StaffUser).filter(StaffUser.email == reception_email).first()
    if not reception:
        reception = StaffUser(
            email=reception_email,
            full_name="Demo Receptionist",
            password_hash=get_password_hash("DemoPass123!"),
            phone_number="+92-300-0000000",
            is_active=True,
        )
        db.add(reception)
        db.flush()
        # Link to clinic (no department needed for receptionist)
        cm = ClinicMembership(
            user_id=reception.user_id,
            clinic_id=clinic.clinic_id,
            department_id=None,
            role=UserRole.RECEPTIONIST,
        )
        db.add(cm)
        db.commit()
    # Doctor
    doctor_email = "dr.sara@mediflow.demo"
    doctor = db.query(StaffUser).filter(StaffUser.email == doctor_email).first()
    if not doctor:
        # Pick a department, e.g., GP if exists, else first department
        gp_dept = next((d for d in departments if d.code == "GP"), departments[0])
        doctor = StaffUser(
            email=doctor_email,
            full_name="Dr. Sara Demo",
            password_hash=get_password_hash("DemoPass123!"),
            phone_number="+92-300-1111111",
            degrees="MD",
            specialization="General Practice",
            license_number="PMDC-DR001",
            room_number="Room 101",
            is_active=True,
        )
        db.add(doctor)
        db.flush()
        cm_doc = ClinicMembership(
            user_id=doctor.user_id,
            clinic_id=clinic.clinic_id,
            department_id=gp_dept.department_id,
            role=UserRole.DOCTOR,
        )
        db.add(cm_doc)
        db.commit()


def seed_doctors(db: Session, clinic: Clinic, departments: list[Department], count_per_dept: int = 3) -> None:
    # Create random doctors only if there are none (apart from demo doctor)
    existing = (
        db.query(StaffUser)
        .join(ClinicMembership, StaffUser.user_id == ClinicMembership.user_id)
        .filter(ClinicMembership.clinic_id == clinic.clinic_id)
        .filter(StaffUser.email != "dr.sara@mediflow.demo")
        .first()
    )
    if existing:
        return
    for dept in departments:
        for _ in range(count_per_dept):
            email = fake.unique.email()
            doc = StaffUser(
                email=email,
                full_name=fake.name(),
                password_hash=get_password_hash("DoctorPass123!"),
                phone_number=fake.phone_number(),
                degrees=f"MD, {fake.bs().title()}",
                specialization=fake.job(),
                license_number=f"PMDC-{fake.bothify(text='???-####')}",
                room_number=f"Room {fake.random_int(min=101, max=210)}",
                is_active=True,
            )
            db.add(doc)
            db.flush()  # obtain user_id
            membership = ClinicMembership(
                user_id=doc.user_id,
                clinic_id=clinic.clinic_id,
                department_id=dept.department_id,
                role=UserRole.DOCTOR,
            )
            db.add(membership)
    db.commit()


def seed_patients(db: Session, clinic: Clinic, count: int = 20) -> None:
    existing = db.query(Patient).filter(Patient.clinic_id == clinic.clinic_id).first()
    if existing:
        return
    for _ in range(count):
        cnic = f"{fake.random_int(min=10000, max=99999)}-{fake.random_int(min=1000000, max=9999999)}-{fake.random_int(min=0, max=9)}"
        patient = Patient(
            clinic_id=clinic.clinic_id,
            display_name=fake.name(),
            cnic=cnic,
            phone_number=fake.phone_number(),
            gender=fake.random_element(elements=("male", "female", "other")),
            age_years=fake.random_int(min=1, max=90),
            preferred_language=fake.random_element(elements=("en", "ur", "roman_ur")),
        )
        db.add(patient)
    db.commit()


def seed_demo_queue_and_token(db: Session, clinic: Clinic, departments: list[Department]) -> None:
    """Create a sample queue ticket and a tracking token that matches the front‑end demo routes.
    The tracking token will be ``track-demo-005`` and the display token will be ``mediflow-main-display``.
    """
    # Ensure a known display token exists
    display_token_str = "mediflow-main-display"
    existing_disp = db.query(DisplayAccessToken).filter(DisplayAccessToken.display_token == display_token_str).first()
    if not existing_disp:
        disp = DisplayAccessToken(
            clinic_id=clinic.clinic_id,
            display_token=display_token_str,
            label="Main Waiting Area TV",
            is_active=True,
        )
        db.add(disp)
        db.commit()

    # Create a patient if none exists (reuse the first one)
    patient = db.query(Patient).filter(Patient.clinic_id == clinic.clinic_id).first()
    if not patient:
        # create a minimal patient
        patient = Patient(
            clinic_id=clinic.clinic_id,
            display_name="Demo Patient",
            cnic="12345-1234567-1",
            phone_number="+92-300-2222222",
            gender="other",
            age_years=30,
            preferred_language="en",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)

    # Create a QueueTicket if one with the demo tracking token does not exist
    tracking_str = "track-demo-005"
    existing_token = db.query(PatientTrackingToken).filter(PatientTrackingToken.tracking_token == tracking_str).first()
    if not existing_token:
        # Pick a department (GP) for the ticket
        gp_dept = next((d for d in departments if d.code == "GP"), departments[0])
        ticket = QueueTicket(
            clinic_id=clinic.clinic_id,
            department_id=gp_dept.department_id,
            patient_id=patient.patient_id,
            token_code="R-001",  # simple token code for demo
            status="WAITING",
            urgency="GREEN",
            priority_score=10,
            channel="QR",
        )
        db.add(ticket)
        db.flush()
        # link tracking token
        pt = PatientTrackingToken(ticket_id=ticket.ticket_id, tracking_token=tracking_str)
        db.add(pt)
        db.commit()


def get_password_hash(password: str) -> str:
    # Import lazily to avoid circular imports
    from app.core.security import get_password_hash as _h

    return _h(password)


def seed_all() -> None:
    db = SessionLocal()
    try:
        clinic = seed_clinic(db)
        depts = seed_departments(db, clinic)
        seed_demo_staff(db, clinic, depts)
        seed_doctors(db, clinic, depts)
        seed_patients(db, clinic)
        seed_demo_queue_and_token(db, clinic, depts)
        print("✅ Seeding complete.")
        print("Demo login credentials:")
        print("  Receptionist: reception@mediflow.demo / DemoPass123!")
        print("  Doctor:       dr.sara@mediflow.demo / DemoPass123!")
        print("  Tracking token for demo: track-demo-005")
        print("  Display token for TV:  mediflow-main-display")
    finally:
        db.close()


if __name__ == "__main__":
    seed_all()
from faker import Faker
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.entities import (
    Clinic,
    Department,
    StaffUser,
    ClinicMembership,
    Patient,
    UserRole,
)
from app.services.display_token import get_or_create_display_token


fake = Faker()


def seed_clinic(db: Session) -> Clinic:
    """Create a demo clinic with slug 'mediflow-demo' if it does not exist and return it.
    This ensures the public endpoint can locate the expected clinic.
    """
    # Try to fetch by the expected slug
    clinic = db.query(Clinic).filter(Clinic.slug == "mediflow-demo").first()
    if clinic:
        return clinic
    # If there is any other active clinic, rename its slug to the demo slug
    existing = db.query(Clinic).filter(Clinic.is_active.is_(True)).first()
    if existing:
        existing.slug = "mediflow-demo"
        db.commit()
        db.refresh(existing)
        # Ensure display token exists
        get_or_create_display_token(db, existing.clinic_id)
        return existing
    # Otherwise create a fresh demo clinic
    clinic = Clinic(
        slug="mediflow-demo",
        name="MediFlow Demo Clinic",
        public_notice="Welcome to MediFlow Demo Clinic.",
        is_active=True,
    )
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    get_or_create_display_token(db, clinic.clinic_id)
    return clinic
    if clinic:
        return clinic
    clinic = Clinic(
        slug="mediflow-demo",
        name="MediFlow Demo Clinic",
        public_notice="Welcome to MediFlow Demo Clinic.",
        is_active=True,
    )
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    # also ensure a display token exists for the clinic
    get_or_create_display_token(db, clinic.clinic_id)
    return clinic


def seed_departments(db: Session, clinic: Clinic) -> list[Department]:
    existing = db.query(Department).filter(Department.clinic_id == clinic.clinic_id).all()
    if existing:
        return existing
    depts_data = [
        {"code": "CARD", "name": "Cardiology"},
        {"code": "ORTHO", "name": "Orthopedics"},
        {"code": "DERM", "name": "Dermatology"},
        {"code": "GP", "name": "General Practice"},
    ]
    depts = []
    for d in depts_data:
        dept = Department(
            clinic_id=clinic.clinic_id,
            code=d["code"],
            name=d["name"],
            floor_or_wing="Ground Floor",
            is_active=True,
        )
        db.add(dept)
        depts.append(dept)
    db.commit()
    for d in depts:
        db.refresh(d)
    return depts


def seed_doctors(db: Session, clinic: Clinic, departments: list[Department], count_per_dept: int = 3) -> None:
    # Create doctors only if there are none for this clinic
    existing = (
        db.query(StaffUser)
        .join(ClinicMembership, StaffUser.user_id == ClinicMembership.user_id)
        .filter(ClinicMembership.clinic_id == clinic.clinic_id)
        .first()
    )
    if existing:
        return
    for dept in departments:
        for _ in range(count_per_dept):
            email = fake.unique.email()
            doc = StaffUser(
                email=email,
                full_name=fake.name(),
                password_hash=get_password_hash("DoctorPass123!"),
                phone_number=fake.phone_number(),
                degrees=f"MD, {fake.bs().title()}",
                specialization=fake.job(),
                license_number=f"PMDC-{fake.bothify(text='???-####')}",
                room_number=f"Room {fake.random_int(min=101, max=210)}",
                is_active=True,
            )
            db.add(doc)
            db.flush()  # obtain user_id
            membership = ClinicMembership(
                user_id=doc.user_id,
                clinic_id=clinic.clinic_id,
                department_id=dept.department_id,
                role=UserRole.DOCTOR,
            )
            db.add(membership)
    db.commit()


def seed_patients(db: Session, clinic: Clinic, count: int = 20) -> None:
    existing = db.query(Patient).filter(Patient.clinic_id == clinic.clinic_id).first()
    if existing:
        return
    for _ in range(count):
        cnic = f"{fake.random_int(min=10000, max=99999)}-{fake.random_int(min=1000000, max=9999999)}-{fake.random_int(min=0, max=9)}"
        patient = Patient(
            clinic_id=clinic.clinic_id,
            display_name=fake.name(),
            cnic=cnic,
            phone_number=fake.phone_number(),
            gender=fake.random_element(elements=("male", "female", "other")),
            age_years=fake.random_int(min=1, max=90),
            preferred_language=fake.random_element(elements=("en", "ur", "roman_ur")),
        )
        db.add(patient)
    db.commit()


def get_password_hash(password: str) -> str:
    # Import lazily to avoid circular imports
    from app.core.security import get_password_hash as _h

    return _h(password)


def seed_all() -> None:
    db = SessionLocal()
    try:
        clinic = seed_clinic(db)
        depts = seed_departments(db, clinic)
        seed_doctors(db, clinic, depts)
        seed_patients(db, clinic)
        print("✅ Seeding complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_all()
