"""Database models and session management."""
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean,
    DateTime, Text, ForeignKey, JSON
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker, relationship
from datetime import datetime, timezone
from app.config import settings


engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="viewer")  # admin, analyst, viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class TelemetryRecord(Base):
    __tablename__ = "telemetry"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    sensor = Column(String(20), nullable=False, index=True)
    value = Column(Float, nullable=False)
    unit = Column(String(10), default="")
    scenario = Column(String(50), default="normal")
    raw_data = Column(JSON, nullable=True)


class DetectionResult(Base):
    __tablename__ = "detections"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    sensor = Column(String(20), nullable=False, index=True)
    value = Column(Float, nullable=False)
    anomaly_score = Column(Float, nullable=False)
    is_anomaly = Column(Boolean, default=False)
    status = Column(String(20), default="NORMAL")  # NORMAL, ANOMALY
    scenario = Column(String(50), default="normal")
    model_used = Column(String(50), default="IsolationForest")


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    sensor = Column(String(20), nullable=False, index=True)
    value = Column(Float, nullable=False)
    anomaly_score = Column(Float, nullable=False)
    severity = Column(String(10), nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    attack_type = Column(String(100), default="Unknown Anomaly")
    status = Column(String(20), default="OPEN")  # OPEN, ACKNOWLEDGED, RESOLVED
    description = Column(Text, default="")
    acknowledged_by = Column(String(50), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)


class SimulationEvent(Base):
    __tablename__ = "simulation_events"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    event_type = Column(String(50), nullable=False)  # START, STOP, SCENARIO_CHANGE
    scenario = Column(String(50), default="normal")
    user = Column(String(50), nullable=True)
    details = Column(JSON, nullable=True)


class ModelMetadata(Base):
    __tablename__ = "model_metadata"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    algorithm = Column(String(100), nullable=False)
    version = Column(String(20), default="1.0.0")
    status = Column(String(20), default="untrained")  # untrained, trained, loaded
    feature_count = Column(Integer, default=0)
    threshold = Column(Float, default=0.5)
    trained_at = Column(DateTime, nullable=True)
    training_samples = Column(Integer, default=0)
    metadata_json = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True)


class SystemConfig(Base):
    __tablename__ = "system_config"
    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_by = Column(String(50), nullable=True)


def get_db():
    """Dependency to get DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)
