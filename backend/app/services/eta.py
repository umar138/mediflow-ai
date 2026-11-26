from typing import Optional, Tuple
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.entities import Consultation, QueueTicket, ClinicDelay, TicketStatus


def get_avg_consult_minutes(
    db: Session,
    doctor_id: Optional[int] = None,
    department_id: Optional[int] = None,
) -> float:
    """
    Mean duration_seconds of last 10 completed consultations for assigned doctor/department.
    If fewer than 3 samples exist, uses configured fallback (12 min default).
    """
    q = (
        db.query(Consultation)
        .join(QueueTicket, Consultation.ticket_id == QueueTicket.ticket_id)
        .filter(
            QueueTicket.status == TicketStatus.COMPLETED,
            Consultation.completed_at.isnot(None),
            Consultation.duration_seconds.isnot(None),
            Consultation.duration_seconds > 0,
        )
    )
    if doctor_id is not None:
        q = q.filter(Consultation.doctor_id == doctor_id)
    elif department_id is not None:
        q = q.filter(QueueTicket.department_id == department_id)

    rows = q.order_by(Consultation.completed_at.desc()).limit(10).all()
    if len(rows) < 3:
        return float(settings.DEFAULT_CONSULT_MINUTES)

    avg_seconds = sum(r.duration_seconds for r in rows if r.duration_seconds is not None) / len(rows)
    return round(avg_seconds / 60.0, 2)


def get_active_delay_minutes(
    db: Session,
    clinic_id: int,
    department_id: Optional[int] = None,
) -> int:
    q = db.query(ClinicDelay).filter(
        ClinicDelay.clinic_id == clinic_id,
        ClinicDelay.is_active.is_(True),
    )
    if department_id is not None:
        q = q.filter((ClinicDelay.department_id == department_id) | (ClinicDelay.department_id.is_(None)))

    delays = q.all()
    return sum(max(0, d.delay_minutes) for d in delays)


def calculate_eta_range(
    db: Session,
    clinic_id: int,
    ahead_count: int,
    doctor_id: Optional[int] = None,
    department_id: Optional[int] = None,
) -> Tuple[int, int, int]:
    """
    effective_position = count of eligible tickets ahead + 1.
    ETA midpoint = effective_position * avg_duration_minutes + active_delay_minutes.
    Returns (eta_min_minutes, eta_max_minutes, effective_position), floored at 0.
    """
    effective_position = max(0, ahead_count) + 1
    avg_mins = get_avg_consult_minutes(db, doctor_id=doctor_id, department_id=department_id)
    delay_mins = get_active_delay_minutes(db, clinic_id=clinic_id, department_id=department_id)
    buf = settings.ETA_BUFFER_MINUTES

    midpoint = (effective_position * avg_mins) + delay_mins
    eta_min = max(0, int(round(midpoint - buf)))
    eta_max = max(eta_min, int(round(midpoint + buf)))
    return eta_min, eta_max, effective_position