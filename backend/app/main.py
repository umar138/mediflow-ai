from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.api.v1.router import api_router
from app.routers import doctor_auth, doctor_ws

Base.metadata.create_all(bind=engine)


def _ensure_bootstrap_defaults():
    """Ensure core clinic, departments, and admin@gmail.com / admin123 exist on startup."""
    from app.core.security import get_password_hash
    from app.models.entities import (
        Clinic, Department, StaffUser, ClinicMembership, DisplayAccessToken, UserRole
    )

    db = SessionLocal()
    try:
        clinic = db.query(Clinic).filter(Clinic.slug == "mediflow-demo").first()
        if not clinic:
            clinic = Clinic(
                slug="mediflow-demo",
                name="MediFlow Central Hospital & Healthcare Center",
                public_notice="Welcome to MediFlow Central Hospital. Please check in at QR kiosk or reception for triage.",
                is_active=True,
            )
            db.add(clinic)
            db.flush()

            for code, name, wing in [
                ("CARD", "Cardiology & Heart Center", "2nd Floor — Heart Wing"),
                ("EMERG", "Emergency & Trauma Center", "Ground Floor — Emergency Block"),
                ("GP", "General Medicine & Acute OPD", "1st Floor — OPD Wing A"),
                ("PEDS", "Pediatrics & Child Healthcare", "1st Floor — Pediatric Wing"),
                ("ORTHO", "Orthopedics & Joint Clinic", "Ground Floor — Bone & Joint Center"),
                ("GYNAE", "Gynecology & Obstetrics", "3rd Floor — Maternity Wing"),
            ]:
                db.add(Department(
                    clinic_id=clinic.clinic_id,
                    code=code,
                    name=name,
                    floor_or_wing=wing,
                    is_active=True,
                ))

            db.add(DisplayAccessToken(
                clinic_id=clinic.clinic_id,
                display_token="mediflow-main-display",
                label="Central Waiting Hall TV (16:9)",
                is_active=True,
            ))

        admin_user = db.query(StaffUser).filter(StaffUser.email == "admin@gmail.com").first()
        if not admin_user:
            admin_user = StaffUser(
                email="admin@gmail.com",
                full_name="Hospital Admin Office",
                password_hash=get_password_hash("admin123"),
                specialization="Hospital Administration",
                degrees="MHA, Admin",
                is_active=True,
                is_present=True,
            )
            db.add(admin_user)
            db.flush()
        else:
            admin_user.password_hash = get_password_hash("admin123")
            admin_user.is_active = True

        membership = (
            db.query(ClinicMembership)
            .filter(ClinicMembership.user_id == admin_user.user_id, ClinicMembership.clinic_id == clinic.clinic_id)
            .first()
        )
        if not membership:
            db.add(ClinicMembership(
                user_id=admin_user.user_id,
                clinic_id=clinic.clinic_id,
                department_id=None,
                role=UserRole.ADMIN,
            ))

        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


_ensure_bootstrap_defaults()

app = FastAPI(
    title="MediFlow AI — Clinical Queue & Triage API",
    version="1.0.0",
    description="Capital Youth Expo — Track 2 Healthcare | Shared Contract v1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(doctor_auth.router)
app.include_router(doctor_ws.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "mediflow-backend"}
