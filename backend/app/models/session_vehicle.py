"""
Session-scoped vehicle model.

Instead of requiring authentication, each anonymous browser session
gets a UUID (session_id stored in localStorage). All vehicles
registered and all logs generated belong to that session_id only.
"""
import enum
import uuid

from sqlalchemy import Column, String, DateTime, Enum, Boolean, TEXT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.utils.database import Base


class VehicleType(str, enum.Enum):
    car = "car"
    motorcycle = "motorcycle"
    van = "van"
    truck = "truck"
    other = "other"


class VehicleStatus(str, enum.Enum):
    approved = "approved"
    blacklisted = "blacklisted"
    expired = "expired"


class SessionVehicle(Base):
    __tablename__ = "session_vehicles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), nullable=False, index=True)

    plate_number = Column(String(20), nullable=False, index=True)
    plate_normalized = Column(String(20), nullable=False, index=True)
    type = Column(Enum(VehicleType, name="oa_vehicle_type"), nullable=False, default=VehicleType.car)
    brand = Column(String(50))
    color = Column(String(30))

    # The demo status — always approved unless the user self-blacklists or sets expired
    status = Column(Enum(VehicleStatus, name="oa_vehicle_status"), nullable=False, default=VehicleStatus.approved)

    # Real-time campus tracking
    is_on_premises = Column(Boolean, default=False)
    last_seen_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    logs = relationship("SessionLog", back_populates="vehicle", cascade="all, delete-orphan")
