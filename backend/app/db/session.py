import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FALLBACK_DB_PATH = (BASE_DIR / "mediflow.db").as_posix()


def _get_engine():
    url_str = settings.DATABASE_URL

    if url_str.startswith("sqlite"):
        return create_engine(url_str, connect_args={"check_same_thread": False})

    # For PostgreSQL: verify connection; if PostgreSQL is not running, seamlessly fallback to SQLite
    try:
        pg_engine = create_engine(
            url_str,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 3}
        )
        with pg_engine.connect() as conn:
            pass
        return pg_engine
    except Exception as exc:
        print(f"\n⚠️  [MediFlow DB Notice] PostgreSQL at localhost:5432 is not running: {exc}")
        print(f"💡 Seamlessly using local SQLite database (sqlite:///{FALLBACK_DB_PATH}) for instant demo mode.\n")
        return create_engine(
            f"sqlite:///{FALLBACK_DB_PATH}",
            connect_args={"check_same_thread": False}
        )


engine = _get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
