from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core import security
from app.schemas.doctor_auth import DoctorLogin

router = APIRouter(prefix="/api/v1/doctor/auth", tags=["doctor-auth"])

@router.post("/login")
def doctor_login(
    payload: DoctorLogin,
    db: Session = Depends(get_db),
):
    email_clean = payload.email.lower().strip()
    
    # 1. Try hospital Doctor model
    doctor = None
    try:
        from app.models.hospital import Doctor
        doctor = db.query(Doctor).filter(Doctor.email == email_clean).first()
    except Exception:
        doctor = None

    if doctor:
        if not security.verify_password(payload.password, doctor.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        token = security.create_access_token(
            data={"sub": str(doctor.doctor_id), "role": "DOCTOR", "hospital_id": str(doctor.hospital_id)}
        )
        return {"access_token": token, "token_type": "bearer"}

    # 2. Fallback to StaffUser with role DOCTOR
    try:
        from app.models.entities import StaffUser, ClinicMembership, UserRole
        user = db.query(StaffUser).filter(StaffUser.email == email_clean, StaffUser.is_active.is_(True)).first()
        if user and security.verify_password(payload.password, user.password_hash):
            membership = db.query(ClinicMembership).filter(ClinicMembership.user_id == user.user_id).first()
            hospital_id = str(membership.clinic_id) if membership else ""
            token = security.create_access_token(
                data={"sub": str(user.user_id), "role": "DOCTOR", "hospital_id": hospital_id}
            )
            return {"access_token": token, "token_type": "bearer"}
    except Exception:
        pass

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
