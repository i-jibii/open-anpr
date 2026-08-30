"""
Models package — import all models here so SQLAlchemy Base.metadata
knows about every table when init_db.py calls Base.metadata.create_all().
"""
from app.models.session_vehicle import SessionVehicle, VehicleType, VehicleStatus
from app.models.session_log import SessionLog, AlertKind, EntryDirection

__all__ = [
    "SessionVehicle",
    "VehicleType",
    "VehicleStatus",
    "SessionLog",
    "AlertKind",
    "EntryDirection",
]
