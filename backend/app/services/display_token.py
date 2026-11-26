import secrets
from sqlalchemy.orm import Session
from app.models.entities import DisplayAccessToken, Clinic


def get_or_create_display_token(db: Session, clinic_id: int) -> str:
    """Return an existing active display token for the clinic or create a new one.

    The function is idempotent – if a token already exists it is returned unchanged.
    """
    token_row = (
        db.query(DisplayAccessToken)
        .filter(
            DisplayAccessToken.clinic_id == clinic_id,
            DisplayAccessToken.is_active.is_(True),
        )
        .first()
    )
    if token_row:
        return token_row.display_token

    new_token = DisplayAccessToken(
        clinic_id=clinic_id,
        display_token=secrets.token_hex(16),  # 32‑char random token
        label=f"Display for clinic {clinic_id}",
        is_active=True,
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)
    return new_token.display_token
