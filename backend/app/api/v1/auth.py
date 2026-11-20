from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import verify_password, create_access_token, decode_access_token
from app.models.entities import StaffUser, ClinicMembership, UserRole
from app.schemas.contracts import StaffLoginRequest, StaffLoginResponse

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

    user = db.query(StaffUser).filter(StaffUser.user_id == payload["sub"], StaffUser.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff user not found")

    membership = (
        db.query(ClinicMembership)
        .filter(ClinicMembership.user_id == user.user_id, ClinicMembership.clinic_id == payload["clinic_id"])
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
    )