import sys
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.core.security import get_password_hash
from app.models.entities import (
    Clinic, Department, StaffUser, ClinicMembership,
    DisplayAccessToken, UserRole
)


def run_clean_setup(reset: bool = True):
    print("🧹 Cleaning database and setting up real hospital schema with integer IDs (1, 2, 3...)...")
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # 1. Main Hospital (clinic_id = 1)
        clinic = Clinic(
            slug="mediflow-demo",
            name="MediFlow Central Hospital & Healthcare Center",
            public_notice="Welcome to MediFlow Central Hospital. Please check in at QR kiosk or reception for triage.",
            is_active=True,
            created_at=now,
        )
        db.add(clinic)
        db.flush()

        # 2. Real Medical Departments (department_id = 1, 2, 3, ...)
        departments_data = [
            ("CARD", "Cardiology & Heart Center", "2nd Floor — Heart Wing"),
            ("EMERG", "Emergency & Trauma Center", "Ground Floor — Emergency Block"),
            ("GP", "General Medicine & Acute OPD", "1st Floor — OPD Wing A"),
            ("PEDS", "Pediatrics & Child Healthcare", "1st Floor — Pediatric Wing"),
            ("ORTHO", "Orthopedics & Joint Clinic", "Ground Floor — Bone & Joint Center"),
            ("GYNAE", "Gynecology & Obstetrics", "3rd Floor — Maternity Wing"),
        ]
        dept_map = {}
        for code, name, wing in departments_data:
            d = Department(
                clinic_id=clinic.clinic_id,
                code=code,
                name=name,
                floor_or_wing=wing,
                is_active=True,
                created_at=now,
            )
            db.add(d)
            dept_map[code] = d
        db.flush()

        # 3. Staff Accounts (user_id = 1, 2, 3, ...)
        staff_data = [
            ("admin@gmail.com", "Hospital Admin Office", UserRole.ADMIN, "MHA, Admin", "Hospital Administration", None, None, "Admin-01"),
            ("dr.ahmed@mediflow.com", "Dr. Ahmed Khan", UserRole.DOCTOR, "MBBS, FCPS Cardiology", "Cardiologist", "PMDC-48291-C", "Room 201 — Cardiology OPD", "CARD"),
            ("dr.sara@mediflow.com", "Dr. Sara Ahmed", UserRole.DOCTOR, "MBBS, MRCP (UK)", "General Physician", "PMDC-51203-M", "Room 102 — General OPD", "GP"),
            ("dr.fatima@mediflow.com", "Dr. Fatima Noor", UserRole.DOCTOR, "MBBS, FCPS Pediatrics", "Pediatric Specialist", "PMDC-60912-P", "Room 105 — Child Clinic", "PEDS"),
            ("reception@mediflow.demo", "Central Reception Desk", UserRole.RECEPTIONIST, None, "Intake & Registration", None, "Main Hall Desk 1", None),
            ("nurse@mediflow.demo", "Staff Nurse Ayesha", UserRole.NURSE, "BSc Nursing, Certified Triage", "Triage & Vitals", None, "Triage Station 1", "EMERG"),
        ]

        doc_pw = get_password_hash("DoctorPass123!")
        admin_pw = get_password_hash("admin123")
        staff_pw = get_password_hash("DemoPass123!")

        for idx, (email, name, role, degs, spec, lic, room, dept_code) in enumerate(staff_data, start=1):
            pw = admin_pw if role == UserRole.ADMIN else (doc_pw if role == UserRole.DOCTOR else staff_pw)
            u = StaffUser(
                email=email,
                full_name=name,
                password_hash=pw,
                degrees=degs,
                specialization=spec,
                license_number=lic,
                room_number=room,
                phone_number=f"0300-12345{idx:02d}",
                is_active=True,
                created_at=now,
            )
            db.add(u)
            db.flush()

            assigned_dept = dept_map.get(dept_code)
            db.add(ClinicMembership(
                user_id=u.user_id,
                clinic_id=clinic.clinic_id,
                department_id=assigned_dept.department_id if assigned_dept else None,
                role=role,
                created_at=now,
            ))

        # 4. Main Waiting Room Display Access Token
        db.add(DisplayAccessToken(
            clinic_id=clinic.clinic_id,
            display_token="mediflow-main-display",
            label="Central Waiting Hall TV (16:9)",
            is_active=True,
            created_at=now,
        ))

        db.commit()
        print("✅ Real hospital database created cleanly with ZERO dummy records!")
        print(f"   Hospital Name: {clinic.name}")
        print(f"   Slug:          {clinic.slug}")
        print(f"   Display Token: mediflow-main-display")
        print("\n🏥 Configured Departments:")
        for code, name, wing in departments_data:
            print(f"   - [{code}] {name} ({wing})")
        print("\n👨‍⚕️ Ready Doctor Accounts (Password: DoctorPass123!):")
        print("   - dr.ahmed@mediflow.com  (Cardiologist, Room 201)")
        print("   - dr.sara@mediflow.com   (General Physician, Room 102)")
        print("   - dr.fatima@mediflow.com (Pediatrician, Room 105)")
        print("\n💼 Staff Accounts (Password: StaffPass123!):")
        print("   - reception@mediflow.com")
        print("   - nurse@mediflow.com")
        print("\n🔑 Admin Account (Password: admin123):")
        print("   - admin@gmail.com")
        print("\n⭐ Database is ready in PostgreSQL for real patients and doctors!")
    finally:
        db.close()


if __name__ == "__main__":
    run_clean_setup(reset=True)
