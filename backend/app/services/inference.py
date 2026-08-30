"""
Inference service for OpenANPR.

Implements a cascaded detection pipeline mirroring the Campus ANPR system:
  Step 1 (Fast Scan):  Vehicle Detection → Plate Detection → bounding boxes
  Step 2 (Deep Analyze): OCR → Color Detection → Brand Detection → annotated image

All YOLO models are lazy-loaded on first use to avoid slow startup.
"""
from __future__ import annotations

import io
import base64
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import cv2

logger = logging.getLogger(__name__)

# ── Lazy-loaded model singletons ──────────────────────────────────────────────
_vehicle_model = None
_plate_model = None
_color_model = None
_brand_model = None
_ocr_model = None

WEIGHTS_DIR = Path(__file__).parent.parent / "models" / "weights"


def _resolve_weight(primary: str, fallback: str) -> Path:
    """Return the first weight file that exists."""
    p = WEIGHTS_DIR / primary
    if p.exists():
        return p
    f = WEIGHTS_DIR / fallback
    if f.exists():
        return f
    raise FileNotFoundError(f"No weight found: tried {primary} and {fallback}")


def get_vehicle_model():
    global _vehicle_model
    if _vehicle_model is None:
        from ultralytics import YOLO
        path = _resolve_weight("vehicle_v3_yolo26_best.pt", "vehicle_best.pt")
        _vehicle_model = YOLO(str(path))
        logger.info(f"Vehicle model loaded: {path.name}")
    return _vehicle_model


def get_plate_model():
    global _plate_model
    if _plate_model is None:
        from ultralytics import YOLO
        path = _resolve_weight("plate_v1_yolo26_best.pt", "best.pt")
        _plate_model = YOLO(str(path))
        logger.info(f"Plate model loaded: {path.name}")
    return _plate_model


def get_color_model():
    global _color_model
    if _color_model is None:
        from ultralytics import YOLO
        path = _resolve_weight("color_v1_yolo26_best.pt", "color_best.pt")
        _color_model = YOLO(str(path))
        logger.info(f"Color model loaded: {path.name}")
    return _color_model


def get_brand_model():
    global _brand_model
    if _brand_model is None:
        from ultralytics import YOLO
        path = _resolve_weight("brand_v2_yolo26_best.pt", "brand_best.pt")
        _brand_model = YOLO(str(path))
        logger.info(f"Brand model loaded: {path.name}")
    return _brand_model


def get_ocr_model():
    global _ocr_model
    if _ocr_model is None:
        from paddleocr import PaddleOCR
        # Removed show_log=False as it was causing an "Unknown argument" crash
        # Disabled mkldnn to bypass a known OneDNN bug in PaddlePaddle 3.3+
        _ocr_model = PaddleOCR(use_angle_cls=True, lang="en", enable_mkldnn=False)
        logger.info("PaddleOCR loaded")
    return _ocr_model


# ── Utility: bytes → cv2 image ───────────────────────────────────────────────

def _bytes_to_cv2(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image buffer — could not decode")
    return img


def _safe_crop(img: np.ndarray, x1: int, y1: int, x2: int, y2: int, pad: int = 8) -> Optional[np.ndarray]:
    """Crop with padding, clamped to image bounds. Returns None if crop is too small."""
    h, w = img.shape[:2]
    y1c = max(0, y1 - pad)
    y2c = min(h, y2 + pad)
    x1c = max(0, x1 - pad)
    x2c = min(w, x2 + pad)
    if (x2c - x1c) < 5 or (y2c - y1c) < 5:
        return None
    return img[y1c:y2c, x1c:x2c]


def _best_box(results, conf_threshold: float = 0.35):
    """Extract the best (highest confidence) box from YOLO results.
    Returns (x1, y1, x2, y2, conf, cls_name) or None."""
    if not results or len(results) == 0:
        return None
    boxes = results[0].boxes
    if boxes is None or len(boxes) == 0:
        return None
    # Filter by confidence
    mask = boxes.conf >= conf_threshold
    if not mask.any():
        return None
    filtered_conf = boxes.conf[mask]
    filtered_xyxy = boxes.xyxy[mask]
    filtered_cls = boxes.cls[mask]
    best_idx = filtered_conf.argmax().item()
    x1, y1, x2, y2 = map(int, filtered_xyxy[best_idx])
    conf = float(filtered_conf[best_idx])
    cls_id = int(filtered_cls[best_idx])
    cls_name = results[0].names.get(cls_id, str(cls_id))
    return x1, y1, x2, y2, conf, cls_name


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: FAST SCAN — called every ~500ms from the frontend auto-scan loop
# ══════════════════════════════════════════════════════════════════════════════

def scan_frame(image_bytes: bytes) -> dict:
    """
    Fast scan: runs Vehicle YOLO → Plate YOLO on a single frame.

    Returns a lightweight dict describing what was found, with bounding box
    coordinates (relative to the image) so the frontend can draw overlays.

    This function is designed to be FAST (<200ms on CPU for frames with no
    vehicle). PaddleOCR is NOT run here.
    """
    img = _bytes_to_cv2(image_bytes)
    h, w = img.shape[:2]

    result = {
        "vehicle_detected": False,
        "plate_detected": False,
        "capture_ready": False,
        "vehicle_box": None,      # {x1, y1, x2, y2, conf, label} in pixels
        "plate_box": None,        # {x1, y1, x2, y2, conf} in pixels
        "frame_width": w,
        "frame_height": h,
    }

    # ── 1. Vehicle detection ──────────────────────────────────────────────────
    vehicle_model = get_vehicle_model()
    v_results = vehicle_model(img, conf=0.35, verbose=False, device="cpu")
    v_box = _best_box(v_results, 0.35)

    if v_box is None:
        return result  # No vehicle — instant return

    vx1, vy1, vx2, vy2, v_conf, v_label = v_box
    result["vehicle_detected"] = True
    result["vehicle_box"] = {
        "x1": vx1, "y1": vy1, "x2": vx2, "y2": vy2,
        "conf": round(v_conf * 100, 1),
        "label": v_label,
    }

    # ── 2. Plate detection ────────────────────────────────────────────────────
    plate_model = get_plate_model()
    p_results = plate_model(img, conf=0.40, verbose=False, device="cpu")
    p_box = _best_box(p_results, 0.40)

    if p_box is None:
        return result  # Vehicle seen but no plate yet — keep scanning

    px1, py1, px2, py2, p_conf, _ = p_box
    result["plate_detected"] = True
    result["plate_box"] = {
        "x1": px1, "y1": py1, "x2": px2, "y2": py2,
        "conf": round(p_conf * 100, 1),
    }

    # ── Both detected → capture is ready ──────────────────────────────────────
    result["capture_ready"] = True
    return result


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: DEEP ANALYSIS — called ONCE after capture_ready triggers
# ══════════════════════════════════════════════════════════════════════════════

def analyze_capture(image_bytes: bytes) -> dict:
    """
    Full deep analysis on a confirmed capture frame:
      1. Vehicle type  (YOLO)
      2. Plate text    (YOLO crop → PaddleOCR)
      3. Vehicle color (YOLO)
      4. Vehicle brand (YOLO)
      5. Annotated preview image (bounding boxes + text overlay)

    Returns a rich dict with all vehicle metadata + base64-encoded JPEG preview.
    """
    img = _bytes_to_cv2(image_bytes)
    h, w = img.shape[:2]

    out = {
        "plate": "",
        "confidence": 0.0,
        "vehicle_type": None,
        "vehicle_color": None,
        "vehicle_brand": None,
        "vehicle_box": None,
        "plate_box": None,
        "preview_b64": None,  # annotated image as base64 JPEG
    }

    # ── 1. Vehicle detection ──────────────────────────────────────────────────
    vehicle_model = get_vehicle_model()
    v_results = vehicle_model(img, conf=0.35, verbose=False, device="cpu")
    v_box = _best_box(v_results, 0.35)

    if v_box:
        vx1, vy1, vx2, vy2, v_conf, v_label = v_box
        out["vehicle_type"] = v_label
        out["vehicle_box"] = {"x1": vx1, "y1": vy1, "x2": vx2, "y2": vy2, "conf": round(v_conf * 100, 1)}

    # ── 2. Plate detection + OCR ──────────────────────────────────────────────
    plate_model = get_plate_model()
    p_results = plate_model(img, conf=0.40, verbose=False, device="cpu")
    p_box = _best_box(p_results, 0.40)

    if p_box:
        px1, py1, px2, py2, p_conf, _ = p_box
        out["plate_box"] = {"x1": px1, "y1": py1, "x2": px2, "y2": py2, "conf": round(p_conf * 100, 1)}

        plate_crop = _safe_crop(img, px1, py1, px2, py2, pad=8)
        if plate_crop is not None:
            try:
                ocr = get_ocr_model()
                ocr_res = ocr.ocr(plate_crop)
                if ocr_res and isinstance(ocr_res, list):
                    text_parts = []
                    avg_conf = 0
                    
                    # Handle new PaddleX / PaddleOCR v3 dictionary format
                    if isinstance(ocr_res[0], dict) and "rec_texts" in ocr_res[0]:
                        texts = ocr_res[0].get("rec_texts", [])
                        scores = ocr_res[0].get("rec_scores", [])
                        for text, conf in zip(texts, scores):
                            if text and text.strip():
                                text_parts.append(text)
                                avg_conf += conf
                                
                    # Handle legacy PaddleOCR list/tuple format
                    elif isinstance(ocr_res[0], list):
                        lines = ocr_res[0]
                        
                        # Sort boxes: Top-to-Bottom, Left-to-Right (Handles 2-line motorcycle plates)
                        try:
                            if lines:
                                # Calculate average height of bounding boxes to determine Y-threshold
                                avg_h = sum((ln[0][2][1] - ln[0][0][1]) for ln in lines if len(ln[0]) == 4) / len(lines)
                                y_thresh = avg_h * 0.5
                                
                                def sort_key(item):
                                    box = item[0]
                                    if len(box) != 4: return (0, 0)
                                    cy = sum(p[1] for p in box) / 4.0
                                    min_x = min(p[0] for p in box)
                                    return (round(cy / y_thresh), min_x)
                                
                                lines.sort(key=sort_key)
                        except Exception as e:
                            logger.warning(f"Failed to sort OCR boxes: {e}")

                        for line in lines:
                            if line and len(line) == 2:
                                text, conf = line[1]
                                if text and text.strip():
                                    text_parts.append(text)
                                    avg_conf += conf

                    if text_parts:
                        # Filter out junk text commonly found on temporary plates or borders
                        junk_words = ["REGION", "FORREGISTRATION", "REGISTERED", "DEALER", "TEMPORARY", "MVFILE"]
                        raw_text = "".join(text_parts).upper()
                        
                        # Strip all non-alphanumeric characters
                        cleaned_plate = "".join(c for c in raw_text if c.isalnum())
                        
                        # Apply junk word filters
                        for junk in junk_words:
                            cleaned_plate = cleaned_plate.replace(junk, "")

                        # A valid plate (global hybrid) is typically between 2 and 10 alphanumeric characters.
                        if 2 <= len(cleaned_plate) <= 10:
                            # Industry Standard: A true license plate almost always contains a mix of letters and numbers.
                            has_letters = any(c.isalpha() for c in cleaned_plate)
                            has_numbers = any(c.isdigit() for c in cleaned_plate)
                            
                            if has_letters and has_numbers:
                                out["plate"] = cleaned_plate
                                out["confidence"] = round((avg_conf / len(text_parts)) * 100, 2)
                            else:
                                logger.info(f"Rejected OCR text (failed alphanumeric mix requirement): {cleaned_plate}")
                                out["plate"] = ""
                                out["confidence"] = 0.0
                        else:
                            # Reject oversized or invalid text (e.g. a banner that was misidentified as a plate)
                            logger.info(f"Rejected OCR text due to length/content constraints: {cleaned_plate}")
                            out["plate"] = ""
                            out["confidence"] = 0.0
            except Exception as e:
                logger.warning(f"OCR failed on plate crop: {e}")

    # ── 3. Color detection ────────────────────────────────────────────────────
    try:
        color_model = get_color_model()
        crop_img = img
        if v_box:
            c_crop = _safe_crop(img, vx1, vy1, vx2, vy2, pad=0)
            if c_crop is not None:
                crop_img = c_crop
                
        c_results = color_model(crop_img, verbose=False, device="cpu")
        c_probs = c_results[0].probs
        if c_probs is not None and c_probs.top1conf.item() >= 0.30:
            out["vehicle_color"] = c_results[0].names[c_probs.top1].capitalize()
    except Exception as e:
        logger.warning(f"Color detection failed: {e}")

    # ── 4. Brand detection ────────────────────────────────────────────────────
    try:
        brand_model = get_brand_model()
        b_results = brand_model(img, conf=0.30, verbose=False, device="cpu")
        b_box = _best_box(b_results, 0.30)
        if b_box:
            bx1, by1, bx2, by2, b_conf, b_label = b_box
            out["vehicle_brand"] = b_label.capitalize()
            out["brand_box"] = {"x1": bx1, "y1": by1, "x2": bx2, "y2": by2, "conf": round(b_conf * 100, 1)}
    except Exception as e:
        logger.warning(f"Brand detection failed: {e}")

    # ── 5. Generate annotated preview image ───────────────────────────────────
    out["preview_b64"] = _draw_annotated_preview(img, out)

    return out


# ══════════════════════════════════════════════════════════════════════════════
# ANNOTATED PREVIEW — OpenCV drawing for the clickable capture image
# ══════════════════════════════════════════════════════════════════════════════

def _draw_annotated_preview(img: np.ndarray, analysis: dict) -> str:
    """
    Draw bounding boxes and info overlay on the captured image.
    Returns base64-encoded JPEG string.
    """
    canvas = img.copy()
    h, w = canvas.shape[:2]

    # ── Draw vehicle bounding box (cyan) ──────────────────────────────────────
    vb = analysis.get("vehicle_box")
    if vb:
        cv2.rectangle(canvas, (vb["x1"], vb["y1"]), (vb["x2"], vb["y2"]),
                       (255, 255, 0), 1)  # cyan in BGR
        label = f'{analysis.get("vehicle_type", "Vehicle")} {vb["conf"]:.0f}%'
        _put_label(canvas, label, vb["x1"], vb["y1"] - 10, (255, 255, 0))

    # ── Draw plate bounding box (green) ───────────────────────────────────────
    pb = analysis.get("plate_box")
    if pb:
        cv2.rectangle(canvas, (pb["x1"], pb["y1"]), (pb["x2"], pb["y2"]),
                       (0, 255, 0), 1)  # green in BGR
        plate_label = analysis.get("plate", "READING...")
        _put_label(canvas, plate_label, pb["x1"], pb["y1"] - 10, (0, 255, 0))

    # ── Draw brand bounding box (orange) ──────────────────────────────────────
    bb = analysis.get("brand_box")
    if bb:
        cv2.rectangle(canvas, (bb["x1"], bb["y1"]), (bb["x2"], bb["y2"]),
                       (0, 165, 255), 1)  # orange in BGR
        brand_label = f'{analysis.get("vehicle_brand", "Brand")} {bb["conf"]:.0f}%'
        _put_label(canvas, brand_label, bb["x1"], bb["y1"] - 10, (0, 165, 255))

    # ── Draw info overlay (top-left) ──────────────────────────────────────────
    overlay_lines = [
        f"Vehicle Type : {analysis.get('vehicle_type') or 'N/A'}",
        f"Vehicle Brand: {analysis.get('vehicle_brand') or 'N/A'}",
        f"Vehicle Color: {analysis.get('vehicle_color') or 'N/A'}",
        f"Plate Number : {analysis.get('plate') or 'N/A'}",
        f"Confidence   : {analysis.get('confidence', 0):.1f}%",
    ]

    # Semi-transparent background for text
    overlay_h = 30 * len(overlay_lines) + 20
    overlay_w = 380
    sub = canvas[10:10 + overlay_h, 10:10 + overlay_w]
    if sub.shape[0] > 0 and sub.shape[1] > 0:
        dark = np.zeros_like(sub)
        cv2.addWeighted(sub, 0.3, dark, 0.7, 0, sub)
        canvas[10:10 + overlay_h, 10:10 + overlay_w] = sub

    for i, line in enumerate(overlay_lines):
        y = 38 + i * 30
        cv2.putText(canvas, line, (20, y), cv2.FONT_HERSHEY_SIMPLEX,
                     0.55, (255, 255, 255), 1, cv2.LINE_AA)

    # ── Encode to JPEG → base64 ──────────────────────────────────────────────
    _, buf = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _put_label(img, text, x, y, color):
    """Draw a text label with a filled background."""
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.55
    thickness = 1
    (tw, th), baseline = cv2.getTextSize(text, font, scale, thickness)
    y = max(th + 5, y)  # don't draw above the image
    cv2.rectangle(img, (x, y - th - 5), (x + tw + 6, y + baseline + 2), color, -1)
    cv2.putText(img, text, (x + 3, y - 2), font, scale, (0, 0, 0), thickness, cv2.LINE_AA)


# ══════════════════════════════════════════════════════════════════════════════
# LEGACY COMPAT — keep the old analyze_image for the existing /detect-image
# ══════════════════════════════════════════════════════════════════════════════

def analyze_image(image_bytes: bytes) -> dict:
    """Legacy: simple plate-only detection. Kept for backward compatibility."""
    result = analyze_capture(image_bytes)
    return {"plate": result["plate"], "confidence": result["confidence"]}
