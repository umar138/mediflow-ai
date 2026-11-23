from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.hospital import HospitalOut, DoctorOut

router = APIRouter(prefix="/hospitals", tags=["hospitals"])

@router.get("", response_model=List[HospitalOut])
def list_hospitals(db: Session = Depends(get_db)):
    try:
        from app.models.hospital import Hospital, Specialization, Doctor
        hospitals = db.query(Hospital).filter(Hospital.is_active.is_(True)).all()
        if hospitals:
            result = []
            for h in hospitals:
                docs = []
                for d in h.doctors:
                    spec_name = d.specialization.name if d.specialization else "General"
                    docs.append(DoctorOut(
                        doctor_id=d.doctor_id,
                        hospital_id=d.hospital_id,
                        email=d.email,
                        full_name=d.full_name,
                        specialization_id=d.specialization_id,
                        specialization_name=spec_name,
                        is_active=d.is_active,
                    ))
                result.append(HospitalOut(
                    hospital_id=h.hospital_id,
                    slug=h.slug,
                    name=h.name,
                    is_active=h.is_active,
                    doctors=docs,
                ))
            return result
    except Exception:
        pass

    # Fallback to clinic entities if hospital table is empty
    from app.models.entities import Clinic, StaffUser, ClinicMembership, UserRole
    clinics = db.query(Clinic).filter(Clinic.is_active.is_(True)).all()
    out = []
    for c in clinics:
        doctor_memberships = (
            db.query(ClinicMembership)
            .filter(ClinicMembership.clinic_id == c.clinic_id, ClinicMembership.role == UserRole.DOCTOR)
            .all()
        )
        docs = []
        for m in doctor_memberships:
            u = db.query(StaffUser).filter(StaffUser.user_id == m.user_id).first()
            if u:
                docs.append(DoctorOut(
                    doctor_id=u.user_id,
                    hospital_id=c.clinic_id,
                    email=u.email,
                    full_name=u.full_name,
                    specialization_id=m.department_id or c.clinic_id,
                    specialization_name=u.specialization or "Consultant",
                    is_active=u.is_active,
                ))
        out.append(HospitalOut(
            hospital_id=c.clinic_id,
            slug=c.slug,
            name=c.name,
            is_active=c.is_active,
            doctors=docs,
        ))
    return out


@router.get("/{slug}/doctors", response_model=List[DoctorOut])
def get_doctors_by_hospital(slug: str, db: Session = Depends(get_db)):
    hospitals = list_hospitals(db)
    for h in hospitals:
        if h.slug == slug:
            return h.doctors or []
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
