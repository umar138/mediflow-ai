from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.entities import QueueTicket, TicketStatus, UrgencyTier

BASE_WEIGHTS: dict[UrgencyTier, int] = {
    UrgencyTier.RED: 100,
    UrgencyTier.YELLOW: 40,
    UrgencyTier.GREEN: 10,
}


def compute_priority_score(urgency: UrgencyTier, checked_in_at: datetime, now: Optional[datetime] = None) -> tuple[int, int]:
    ref_now = now or datetime.now(timezone.utc)
    if checked_in_at.tzinfo is None:
        checked_in_at = checked_in_at.replace(tzinfo=timezone.utc)
    wait_minutes = max(0, int((ref_now - checked_in_at).total_seconds() // 60))
    aging_points = min(120, wait_minutes // 10)
    score = BASE_WEIGHTS[urgency] + aging_points
    return score, wait_minutes


def get_sorted_waiting_tickets(
    db: Session,
    clinic_id: int,
    department_id: Optional[int] = None,
) -> List[tuple[QueueTicket, int, int]]:
    """
    Returns list of (ticket, priority_score, wait_minutes) for WAITING tickets only.
    Excludes ON_HOLD and non-waiting tickets.
    Sorted deterministically by: priority_score DESC, checked_in_at ASC, ticket_id ASC.
    """
    q = db.query(QueueTicket).filter(
        QueueTicket.clinic_id == clinic_id,
        QueueTicket.status == TicketStatus.WAITING,
    )
    if department_id is not None:
        q = q.filter(QueueTicket.department_id == department_id)

    tickets = q.all()
    now = datetime.now(timezone.utc)
    enriched: List[tuple[QueueTicket, int, int]] = []
    for t in tickets:
        score, wait_mins = compute_priority_score(t.urgency, t.checked_in_at, now=now)
        enriched.append((t, score, wait_mins))

    enriched.sort(key=lambda item: (-item[1], item[0].checked_in_at, item[0].ticket_id))
    return enriched