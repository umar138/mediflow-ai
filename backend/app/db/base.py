from sqlalchemy.orm import declarative_base

Base = declarative_base()

# Re-export session components for compatibility
from app.db.session import engine, SessionLocal, get_db  # noqa: E402, F401
