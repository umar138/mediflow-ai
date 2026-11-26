from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.models.entities import StaffUser, ClinicMembership, Clinic, Department, UserRole
from app.schemas.contracts import (
    StaffLoginRequest, StaffLoginResponse,
    DoctorRegisterRequest, DoctorRegisterResponse
)

router = APIRouter(prefix="/auth", tags=["auth"])


def get_current_staff_context(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload or "clinic_id" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    try:
        user_id = int(payload["sub"])
        clinic_id = int(payload["clinic_id"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = db.query(StaffUser).filter(StaffUser.user_id == user_id, StaffUser.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff user not found")

    membership = (
        db.query(ClinicMembership)
        .filter(ClinicMembership.user_id == user.user_id, ClinicMembership.clinic_id == clinic_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No membership for requested clinic")

    return {
        "user": user,
        "user_id": user.user_id,
        "role": membership.role,
        "clinic_id": membership.clinic_id,
        "department_id": membership.department_id,
    }


def require_roles(allowed_roles: set[UserRole]):
    def _checker(ctx: dict = Depends(get_current_staff_context)) -> dict:
        if ctx["role"] not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role permission")
        return ctx
    return _checker


@router.post("/login", response_model=StaffLoginResponse)
def staff_login(req: StaffLoginRequest, db: Session = Depends(get_db)):
    user = db.query(StaffUser).filter(StaffUser.email == req.email.lower().strip(), StaffUser.is_active.is_(True)).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    membership = db.query(ClinicMembership).filter(ClinicMembership.user_id == user.user_id).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not assigned to any clinic")

    dept_name = None
    if membership.department_id:
        dept = db.query(Department).filter(Department.department_id == membership.department_id).first()
        if dept:
            dept_name = dept.name

    access_token = create_access_token({
        "sub": str(user.user_id),
        "clinic_id": str(membership.clinic_id),
        "role": membership.role.value,
    })
    return StaffLoginResponse(
        access_token=access_token,
        user_id=user.user_id,
        full_name=user.full_name,
        role=membership.role.value,
        clinic_id=membership.clinic_id,
        department_id=membership.department_id,
        degrees=user.degrees,
        specialization=user.specialization,
        room_number=user.room_number,
        department_name=dept_name,
    )


@router.post("/doctor/register", response_model=DoctorRegisterResponse, status_code=status.HTTP_201_CREATED)
def doctor_register(req: DoctorRegisterRequest, db: Session = Depends(get_db)):
    # 1. Check duplicate email
    existing_user = db.query(StaffUser).filter(StaffUser.email == req.email.lower().strip()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A doctor or staff account with this email already exists. Please log in.",
        )

    # 2. Find Clinic (by slug or first active)
    clinic = db.query(Clinic).filter(Clinic.slug == req.clinic_slug, Clinic.is_active.is_(True)).first()
    if not clinic:
        clinic = db.query(Clinic).filter(Clinic.is_active.is_(True)).first()
    if not clinic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active hospital/clinic found.")

    # 3. Find Department
    dept = None
    if req.department_id:
        dept = db.query(Department).filter(Department.department_id == req.department_id, Department.clinic_id == clinic.clinic_id).first()
    if not dept and req.department_code:
        dept = db.query(Department).filter(Department.code == req.department_code.upper(), Department.clinic_id == clinic.clinic_id).first()
    if not dept:
        # Fallback to first department
        dept = db.query(Department).filter(Department.clinic_id == clinic.clinic_id).first()

    # 4. Create Doctor StaffUser
    new_doc = StaffUser(
        email=req.email.lower().strip(),
        full_name=req.full_name.strip(),
        password_hash=get_password_hash(req.password),
        phone_number=req.phone_number.strip() if req.phone_number else None,
        degrees=req.degrees.strip(),
        specialization=req.specialization.strip(),
        license_number=req.license_number.strip(),
        room_number=req.room_number.strip(),
        is_active=True,
    )
    db.add(new_doc)
    db.flush()

    # 5. Assign Clinic Membership
    db.add(ClinicMembership(
        user_id=new_doc.user_id,
        clinic_id=clinic.clinic_id,
        department_id=dept.department_id if dept else None,
        role=UserRole.DOCTOR,
    ))
    db.commit()

    access_token = create_access_token({
        "sub": str(new_doc.user_id),
        "clinic_id": str(clinic.clinic_id),
        "role": UserRole.DOCTOR.value,
    })

    return DoctorRegisterResponse(
        user_id=new_doc.user_id,
        full_name=new_doc.full_name,
        email=new_doc.email,
        role=UserRole.DOCTOR.value,
        degrees=new_doc.degrees,
        specialization=new_doc.specialization,
        room_number=new_doc.room_number,
        department_name=dept.name if dept else "General",
        clinic_name=clinic.name,
        access_token=access_token,
    )