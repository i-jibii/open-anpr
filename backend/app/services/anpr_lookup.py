"""
ANPR lookup logic adapted for OpenANPR portfolio.

Plates are classified against the SESSION's registered vehicles
(not a campus-wide DB). This preserves full isolation between sessions.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models.session_vehicle import SessionVehicle, VehicleStatus
from app.models.session_log import AlertKind
from app.utils.plates import normalize_plate_key, format_plate_display


COOLDOWN_SECONDS = 15


def find_vehicle_by_plate(
    db: Session,
    session_id: str,
    plate_raw: str,
) -> Optional[SessionVehicle]:
    """
    Find a registered vehicle in the CURRENT session matching the given plate.
    Uses normalized (no-whitespace, uppercase) comparison for robustness.
    """
    key = normalize_plate_key(plate_raw)
    if not key:
        return None
    return (
        db.query(SessionVehicle)
        .filter(
            SessionVehicle.session_id == session_id,
            SessionVehicle.plate_normalized == key,
        )
        .first()
    )


def classify_plate(
    db: Session,
    session_id: str,
    plate_raw: str,
    ocr_confidence: Optional[float] = None,
    min_confidence: float = 70.0,
) -> Tuple[AlertKind, Optional[SessionVehicle], str]:
    """
    Returns (alert_kind, vehicle_or_none, human_message).

    Classification rules (mirrors original campus system):
      - No match + low confidence  → anomaly_low_confidence
      - No match                   → anomaly_unregistered
      - Matched + blacklisted      → breach_blacklisted
      - Matched + expired          → breach_expired
      - Matched + approved         → access
    """
    key = normalize_plate_key(plate_raw)
    if not key:
        return AlertKind.anomaly_unregistered, None, "Empty plate"

    vehicle = find_vehicle_by_plate(db, session_id, plate_raw)

    if not vehicle:
        if ocr_confidence is not None and ocr_confidence < min_confidence:
            return (
                AlertKind.anomaly_low_confidence,
                None,
                "Low confidence read; plate not in your registry",
            )
        return AlertKind.anomaly_unregistered, None, "Plate not registered in this session"

    if vehicle.status == VehicleStatus.blacklisted:
        return AlertKind.breach_blacklisted, vehicle, "Vehicle is blacklisted"

    if vehicle.status == VehicleStatus.expired:
        return AlertKind.breach_expired, vehicle, "Vehicle registration expired"

    return AlertKind.access, vehicle, "Vehicle is registered"
