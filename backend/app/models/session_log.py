"""
Session-scoped detection log model.

Every plate scan result (access, anomaly, breach) is logged here.
Logs are filtered by session_id so users only see their own history.
"""
import enum
import uuid

from sqlalchemy import Column, String, DateTime, Enum, Boolean, Numeric, ForeignKey, TEXT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.utils.database import Base


class AlertKind(str, enum.Enum):
    access = "access"
    anomaly_unregistered = "anomaly_unregistered"
    anomaly_low_confidence = "anomaly_low_confidence"
    breach_blacklisted = "breach_blacklisted"
    breach_expired = "breach_expired"


class EntryDirection(str, enum.Enum):
    entry = "entry"
    exit = "exit"


class SessionLog(Base):
    __tablename__ = "session_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), nullable=False, index=True)

    # Detected plate (as seen by OCR / user typed)
    detected_plate = Column(String(40), nullable=False)
    plate_normalized = Column(String(20), nullable=False)

    # Match result
    alert_kind = Column(Enum(AlertKind, name="oa_alert_kind"), nullable=False)
    direction = Column(Enum(EntryDirection, name="oa_entry_direction"), nullable=True)
    confidence_score = Column(Numeric(5, 2))

    # Vehicle info at time of detection (denormalized for fast display)
    vehicle_id = Column(String(36), ForeignKey("session_vehicles.id"), nullable=True)
    vehicle_brand = Column(String(50))
    vehicle_color = Column(String(30))
    vehicle_type = Column(String(20))

    is_violation = Column(Boolean, default=False)

    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    vehicle = relationship("SessionVehicle", back_populates="logs")
