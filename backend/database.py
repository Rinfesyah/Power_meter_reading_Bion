import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Database URL from environment (Docker/Cloud) or fallback to local postgres
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres123@127.0.0.1:5432/power_meter_db"
)


# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base
Base = declarative_base()

def get_db():
    """Dependency injection for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def check_db_connection() -> bool:
    """Check if the database connection is healthy."""
    try:
        with engine.connect() as conn:
            return True
    except Exception as e:
        print(f"[DB ERROR] Failed to connect to database: {e}")
        return False
