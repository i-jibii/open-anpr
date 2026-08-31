"""
Public API router for OpenANPR portfolio.

All endpoints are SESSION-scoped. No authentication is required.
The caller must supply an X-Session-ID header (a UUID generated and
stored in the browser's localStorage).

Routes:
  POST /api/public/register    – Register a vehicle to the session
  POST /api/public/detect      – Submit a plate string for ANPR classification
  GET  /api/public/logs        – Fetch this session's detection history
  GET  /api/public/vehicles    – Fetch this session's registered vehicles
  DELETE /api/public/vehicles/{id} – Remove a registered vehicle
"""

import uuid
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, Request, Form
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.session_log import AlertKind, EntryDirection, SessionLog
from app.models.session_vehicle import SessionVehicle, VehicleStatus, VehicleType
from app.services.alerts_ws import alerts_ws_manager
from app.services.anpr_lookup import COOLDOWN_SECONDS, classify_plate
from app.utils.database import get_db
from app.utils.plates import format_plate_display, normalize_plate_key
from app.utils.rate_limit import limiter

router = APIRouter()


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    plate_number: str = Field(..., min_length=1, max_length=20)
    type: str = Field(default="car")
    brand: Optional[str] = Field(default=None, max_length=50)
    color: Optional[str] = Field(default=None, max_length=30)
    status: str = Field(default="approved")  # approved | blacklisted | expired


class DetectRequest(BaseModel):
    plate: str = Field(..., min_length=1, max_length=40)
    confidence_score: Optional[float] = Field(default=None, ge=0, le=100)
    detected_type: Optional[str] = None
    detected_color: Optional[str] = None
    detected_brand: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_session_id(x_session_id: Optional[str] = Header(default=None)) -> str:
    """Extract and validate the session ID from request headers."""
    if not x_session_id or not x_session_id.strip():
        raise HTTPException(
            status_code=400,
            detail="X-Session-ID header is required. Please refresh the page.",
        )
    # Basic UUID format validation
    try:
        uuid.UUID(x_session_id.strip())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="X-Session-ID must be a valid UUID.",
        )
    return x_session_id.strip()


def _vehicle_to_dict(v: SessionVehicle) -> dict:
    return {
        "id": v.id,
        "session_id": v.session_id,
        "plate_number": v.plate_number,
        "plate_normalized": v.plate_normalized,
        "type": v.type.value if v.type else "car",
        "brand": v.brand,
        "color": v.color,
        "status": v.status.value if v.status else "approved",
        "is_on_premises": v.is_on_premises,
        "last_seen_at": v.last_seen_at.isoformat() if v.last_seen_at else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


def _log_to_dict(log: SessionLog) -> dict:
    return {
        "id": log.id,
        "session_id": log.session_id,
        "detected_plate": log.detected_plate,
        "plate_normalized": log.plate_normalized,
        "alert_kind": log.alert_kind.value if log.alert_kind else None,
        "direction": log.direction.value if log.direction else None,
        "confidence_score": float(log.confidence_score) if log.confidence_score is not None else None,
        "vehicle_id": log.vehicle_id,
        "vehicle_brand": log.vehicle_brand,
        "vehicle_color": log.vehicle_color,
        "vehicle_type": log.vehicle_type,
        "is_violation": log.is_violation,
        "timestamp": log.timestamp.isoformat() if log.timestamp else None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", summary="Register a vehicle to this session")
@limiter.limit("10/minute")
def register_vehicle(
    request: Request,
    body: RegisterRequest,
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
):
    """
    Register a vehicle plate to the caller's session.
    Instantly approved — no ID or license upload required.
    """
    key = normalize_plate_key(body.plate_number)
    if not key:
        raise HTTPException(status_code=400, detail="Invalid plate number.")

    # Prevent duplicate plate within same session
    existing = (
        db.query(SessionVehicle)
        .filter(
            SessionVehicle.session_id == session_id,
            SessionVehicle.plate_normalized == key,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Plate '{body.plate_number.upper()}' is already registered in this session.",
        )

    # Validate enums
    try:
        v_type = VehicleType(body.type)
    except ValueError:
        v_type = VehicleType.car

    try:
        v_status = VehicleStatus(body.status)
    except ValueError:
        v_status = VehicleStatus.approved

    vehicle = SessionVehicle(
        id=str(uuid.uuid4()),
        session_id=session_id,
        plate_number=format_plate_display(body.plate_number),
        plate_normalized=key,
        type=v_type,
        brand=body.brand,
        color=body.color,
        status=v_status,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)

    return {"status": "ok", "vehicle": _vehicle_to_dict(vehicle)}


@router.post("/detect", summary="Analyze a plate via text input")
@limiter.limit("20/minute")
async def detect_plate(
    request: Request,
    body: DetectRequest,
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
):
    """
    Classify a plate string against this session's registered vehicles.

    Returns:
      - alert_kind: access | anomaly_unregistered | anomaly_low_confidence | breach_blacklisted | breach_expired
      - direction: entry | exit (for registered/access vehicles)
      - vehicle info if matched

    Mirrors the campus system's _run_capture() logic with cooldown dedup.
    """
    key = normalize_plate_key(body.plate)
    if not key:
        raise HTTPException(status_code=400, detail="Invalid plate string.")

    kind, vehicle, message = classify_plate(
        db,
        session_id,
        body.plate,
        ocr_confidence=body.confidence_score,
    )

    is_violation = kind.value.startswith("breach_")
    direction: Optional[EntryDirection] = None
    is_cooldown_dup = False

    # ── Smart Entry/Exit toggle (identical to campus system) ──────────────────
    if vehicle and kind == AlertKind.access:
        if vehicle.is_on_premises and vehicle.last_seen_at:
            elapsed = (datetime.now(timezone.utc) - vehicle.last_seen_at).total_seconds()
            if elapsed <= COOLDOWN_SECONDS:
                is_cooldown_dup = True
            else:
                direction = EntryDirection.exit
        elif vehicle.is_on_premises:
            direction = EntryDirection.exit
        else:
            direction = EntryDirection.entry

    if is_cooldown_dup and vehicle:
        vehicle.last_seen_at = datetime.now(timezone.utc)
        db.commit()
        return {
            "status": "ok",
            "duplicate_skipped": True,
            "alert_kind": kind.value,
            "direction": "duplicate_skipped",
            "plate_display": format_plate_display(body.plate),
            "message": message,
            "vehicle": _vehicle_to_dict(vehicle) if vehicle else None,
        }

    # ── Persist the log ───────────────────────────────────────────────────────
    log = SessionLog(
        id=str(uuid.uuid4()),
        session_id=session_id,
        detected_plate=format_plate_display(body.plate),
        plate_normalized=key,
        alert_kind=kind,
        direction=direction,
        confidence_score=body.confidence_score,
        vehicle_id=vehicle.id if vehicle else None,
        vehicle_brand=vehicle.brand.title() if vehicle and vehicle.brand else (body.detected_brand.title() if body.detected_brand else None),
        vehicle_color=vehicle.color.title() if vehicle and vehicle.color else (body.detected_color.title() if body.detected_color else None),
        vehicle_type=vehicle.type.value.title() if vehicle and vehicle.type else (body.detected_type.title() if body.detected_type else None),
        is_violation=is_violation,
    )
    db.add(log)

    # ── Update vehicle on-premises state ─────────────────────────────────────
    if vehicle and kind == AlertKind.access:
        vehicle.is_on_premises = direction == EntryDirection.entry
        vehicle.last_seen_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(log)

    result = {
        "status": "ok",
        "log_id": log.id,
        "alert_kind": kind.value,
        "direction": direction.value if direction else None,
        "plate_display": format_plate_display(body.plate),
        "plate_normalized": key,
        "confidence_score": body.confidence_score,
        "is_violation": is_violation,
        "message": message,
        "vehicle": _vehicle_to_dict(vehicle) if vehicle else None,
    }

    # ── Broadcast to any open WebSocket connections ───────────────────────────
    try:
        await alerts_ws_manager.broadcast(
            {
                "type": "detection",
                "session_id": session_id,
                **result,
            }
        )
    except Exception:
        pass  # Never crash the HTTP response due to WS issues

    return result


@router.post("/scan-frame", summary="Fast vehicle and plate bounds detection")
@limiter.limit("1000/minute")
async def scan_frame_endpoint(
    request: Request,
    file: UploadFile = File(...),
    zone_points: Optional[str] = Form(None),
):
    """
    Fast frame scan for the auto-scan loop (~200ms).
    Runs Vehicle YOLO → Plate YOLO and returns bounding box coordinates.
    Does NOT run OCR or any slow models.
    No session ID required — this is a stateless detection-only call.
    """
    from app.services.inference import scan_frame
    from starlette.concurrency import run_in_threadpool
    image_bytes = await file.read()
    
    parsed_zone = None
    if zone_points:
        try:
            parsed_zone = json.loads(zone_points)
        except Exception as e:
            pass

    try:
        return await run_in_threadpool(scan_frame, image_bytes, parsed_zone)
    except Exception as e:
        return {
            "vehicle_detected": False,
            "plate_detected": False,
            "capture_ready": False,
            "error": str(e),
        }


@router.post("/analyze-capture", summary="Deep analysis on a confirmed capture")
@limiter.limit("30/minute")
async def analyze_capture_endpoint(
    request: Request,
    file: UploadFile = File(...),
    zone_points: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
):
    """
    Full deep analysis triggered ONCE after auto-scan confirms both vehicle
    and plate are detected.

    Runs: Vehicle Type → Plate OCR → Color → Brand → Annotated Preview.
    Then classifies the plate against the session's registered vehicles.
    """
    from app.services.inference import analyze_capture
    from starlette.concurrency import run_in_threadpool
    image_bytes = await file.read()

    parsed_zone = None
    if zone_points:
        try:
            parsed_zone = json.loads(zone_points)
        except Exception as e:
            pass

    try:
        analysis = await run_in_threadpool(analyze_capture, image_bytes, parsed_zone)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    plate_text = analysis["plate"]
    confidence = analysis["confidence"]

    # Build the classification result
    classification = None
    if plate_text:
        detect_req = DetectRequest(
            plate=plate_text, 
            confidence_score=confidence,
            detected_type=analysis.get("vehicle_type"),
            detected_color=analysis.get("vehicle_color"),
            detected_brand=analysis.get("vehicle_brand")
        )
        classification = await detect_plate(request, detect_req, db, session_id)

    return {
        "status": "ok",
        "plate": plate_text or "",
        "confidence": confidence,
        "vehicle_type": analysis.get("vehicle_type"),
        "vehicle_color": analysis.get("vehicle_color"),
        "vehicle_brand": analysis.get("vehicle_brand"),
        "vehicle_box": analysis.get("vehicle_box"),
        "plate_box": analysis.get("plate_box"),
        "preview_b64": analysis.get("preview_b64"),
        "classification": classification,
    }


@router.post("/detect-image", summary="LEGACY: Analyze an uploaded image directly")
@limiter.limit("10/minute")
async def detect_image(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
):
    """
    Legacy endpoint: Process an image using YOLO/OCR to find a plate, then classify it.
    """
    from app.services.inference import analyze_image
    from starlette.concurrency import run_in_threadpool
    image_bytes = await file.read()

    try:
        inference_res = await run_in_threadpool(analyze_image, image_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    plate_text = inference_res["plate"]
    confidence = inference_res["confidence"]

    if not plate_text:
        return {
            "status": "ok",
            "error": "No plate detected in the image.",
            "alert_kind": "anomaly_low_confidence",
            "plate_display": "UNKNOWN"
        }

    detect_req = DetectRequest(
        plate=plate_text, 
        confidence_score=confidence,
        detected_type=inference_res.get("vehicle_type"),
        detected_color=inference_res.get("vehicle_color"),
        detected_brand=inference_res.get("vehicle_brand")
    )
    return await detect_plate(request, detect_req, db, session_id)


@router.get("/logs", summary="Get all logs for the current session")
@limiter.limit("60/minute")
def get_session_logs(
    request: Request,
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
    limit: int = 100,
    offset: int = 0,
):
    """Return this session's detection logs, newest first."""
    logs = (
        db.query(SessionLog)
        .filter(SessionLog.session_id == session_id)
        .order_by(SessionLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total = (
        db.query(SessionLog)
        .filter(SessionLog.session_id == session_id)
        .count()
    )
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "logs": [_log_to_dict(log) for log in logs],
    }


@router.get("/vehicles", summary="Get all registered vehicles for the session")
@limiter.limit("60/minute")
def get_session_vehicles(
    request: Request,
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
):
    """Return all vehicles the user registered in this session."""
    vehicles = (
        db.query(SessionVehicle)
        .filter(SessionVehicle.session_id == session_id)
        .order_by(SessionVehicle.created_at.desc())
        .all()
    )
    return {"vehicles": [_vehicle_to_dict(v) for v in vehicles]}


@router.delete("/vehicles/{vehicle_id}", summary="Delete a vehicle")
@limiter.limit("30/minute")
def delete_vehicle(
    request: Request,
    vehicle_id: str,
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
):
    """Remove a vehicle from this session's registry."""
    vehicle = (
        db.query(SessionVehicle)
        .filter(
            SessionVehicle.id == vehicle_id,
            SessionVehicle.session_id == session_id,
        )
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found in this session.")
    db.delete(vehicle)
    db.commit()
    return {"status": "ok", "deleted_id": vehicle_id}


@router.put("/vehicles/{vehicle_id}", summary="Update a vehicle")
@limiter.limit("30/minute")
def update_vehicle(
    request: Request,
    vehicle_id: str,
    body: RegisterRequest,
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
):
    """Update a vehicle's details."""
    vehicle = (
        db.query(SessionVehicle)
        .filter(
            SessionVehicle.id == vehicle_id,
            SessionVehicle.session_id == session_id,
        )
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found in this session.")

    key = normalize_plate_key(body.plate_number)
    if not key:
        raise HTTPException(status_code=400, detail="Invalid plate number.")

    # Check for conflicts
    if key != vehicle.plate_normalized:
        existing = (
            db.query(SessionVehicle)
            .filter(
                SessionVehicle.session_id == session_id,
                SessionVehicle.plate_normalized == key,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Plate '{body.plate_number.upper()}' is already registered.",
            )

    try:
        v_type = VehicleType(body.type)
    except ValueError:
        v_type = VehicleType.car

    try:
        v_status = VehicleStatus(body.status)
    except ValueError:
        v_status = VehicleStatus.approved

    vehicle.plate_number = format_plate_display(body.plate_number)
    vehicle.plate_normalized = key
    vehicle.type = v_type
    vehicle.brand = body.brand
    vehicle.color = body.color
    vehicle.status = v_status

    db.commit()
    db.refresh(vehicle)
    return {"status": "ok", "vehicle": _vehicle_to_dict(vehicle)}


@router.get("/stats", summary="Get session statistics")
@limiter.limit("60/minute")
def get_session_stats(
    request: Request,
    db: Session = Depends(get_db),
    session_id: str = Depends(_get_session_id),
):
    from sqlalchemy import func

    total_logs = db.query(SessionLog).filter(SessionLog.session_id == session_id).count()

    on_premises = (
        db.query(SessionVehicle)
        .filter(SessionVehicle.session_id == session_id, SessionVehicle.is_on_premises == True)
        .count()
    )

    registered_plates_subquery = db.query(SessionVehicle.plate_normalized).filter(SessionVehicle.session_id == session_id)
    
    anomaly_count = (
        db.query(func.count(func.distinct(SessionLog.plate_normalized)))
        .filter(
            SessionLog.session_id == session_id,
            SessionLog.alert_kind.in_([AlertKind.anomaly_unregistered, AlertKind.anomaly_low_confidence]),
            ~SessionLog.plate_normalized.in_(registered_plates_subquery)
        )
        .scalar() or 0
    )

    valid_plates_subquery = (
        db.query(SessionVehicle.plate_normalized)
        .filter(
            SessionVehicle.session_id == session_id,
            SessionVehicle.status == VehicleStatus.approved
        )
    )

    breach_count = (
        db.query(func.count(func.distinct(SessionLog.plate_normalized)))
        .filter(
            SessionLog.session_id == session_id,
            SessionLog.alert_kind.in_([AlertKind.breach_blacklisted, AlertKind.breach_expired]),
            ~SessionLog.plate_normalized.in_(valid_plates_subquery)
        )
        .scalar() or 0
    )

    return {
        "total_detections": total_logs,
        "access_count": on_premises,
        "anomaly_count": anomaly_count,
        "breach_count": breach_count,
    }
