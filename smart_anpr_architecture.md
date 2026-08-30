# SMART-PLATE Architecture & Workflow

The **SMART-PLATE** (Smart ANPR) system in this project operates through a meticulously designed, event-driven pipeline. It handles everything from the initial camera detection (the external "smart_anpr engine") down to real-time websocket broadcasting and database logging.

Here is the step-by-step technical breakdown of how the ANPR logic meticulously works in the backend (primarily handled in `backend/app/api/anpr.py` and `backend/app/services/anpr_lookup.py`):

### 1. Webhook Ingestion & Security Authentication
The process begins when an external OCR/Camera engine (IoT client) detects a plate and pushes the data to the backend via `POST /webhook/smart-anpr`.
* **Payload parsing:** It receives the raw `plate_number`, OCR `confidence`, vehicle `brand`/`color`/`type`, bounding box coordinates (`bbox`), and a base64 string or URL of the evidence image.
* **Security:** The endpoint is secured by an `x_webhook_token` header, which is strictly validated against the `SMART_ANPR_WEBHOOK_TOKEN` environment variable to prevent spoofing.

### 2. Plate Normalization & Gate Resolution
Once the payload is received, it gets passed to the core `_run_capture` function.
* **Normalization:** The raw plate string is aggressively stripped of whitespaces and converted to uppercase (e.g., `ABC 1234` becomes `ABC1234`) using `normalize_plate_key()`. This ensures consistent database matching.
* **Context Resolution:** It attempts to map the event to a specific gate (e.g., "Main Gate") by resolving the `camera_id` or `gate_name` provided in the payload against the `Gate` and `Camera` database tables. 

### 3. The Classification Engine
The normalized plate is sent to `classify_plate()`, which cross-references the PostgreSQL database to determine the vehicle's authorization status. It checks in a specific hierarchy:
* **Unregistered / Low Confidence:** If the plate doesn't exist in the system, it's flagged as `anomaly_unregistered`. If the OCR confidence is below the `70.0` threshold, it's flagged as `anomaly_low_confidence`.
* **Blacklisted:** If the vehicle is found but has an active record in the `BlacklistRecord` table, it's immediately classified as `breach_blacklisted`.
* **Rejected / Suspended:** If the vehicle's registration was rejected by an admin, or the owner's account is suspended, it returns `breach_rejected`.
* **Expired:** If the current date is past the vehicle's `expiry_date`, it returns `breach_expired`.
* **Access Granted:** If it passes all checks, it returns `access`.

### 4. Smart Entry/Exit Toggle & Anti-Spam Debounce
For vehicles granted `access`, the system implements a smart state-tracking logic to determine if the vehicle is entering or exiting the campus:
* **State Check:** It checks the `is_on_campus` boolean flag of the vehicle.
* **Entry vs Exit:** If the vehicle is currently *outside*, the event is logged as an **ENTRY**. If the vehicle is already *inside*, the event is logged as an **EXIT**.
* **15-Second Cooldown (Debounce):** Because ANPR cameras can capture the same plate multiple times per second, the system compares the current time against the vehicle's `last_seen_at` timestamp. If the detection happens within 15 seconds of the last capture, it is treated as a duplicate polling read. The system skips creating a new entry log to prevent database spam, silently updating only the `last_seen_at` timestamp.

### 5. Persistent Logging & Anomaly Creation
The system uses SQLAlchemy to commit the events to the database:
* **`EntryLog` & `AnprPlateCapture`:** Two separate records are generated. The `EntryLog` tracks the logical movement (direction, authorization status, violation flag), while the `AnprPlateCapture` tracks the physical evidence (the raw plate, the image snapshot, OCR confidence, detected color/brand).
* **Auto-Flagging:** If the classification returned anything other than `access` (a breach or anomaly), the system automatically generates an `AnprAnomalyEvent` (for security personnel to review) and a `Violation` record. 

### 6. Real-Time Broadcaster & Notifications
* **WebSocket Push:** If an anomaly is created, the system uses an async broadcaster (`alerts_ws_manager`) to instantly push the event to the Security Dashboard UI. This allows security guards to see flagged vehicles in real-time without refreshing their browser. For privacy, the owner's name is masked (e.g., `J*** D***`).
* **Owner Notifications:** The vehicle owner receives an in-app notification (e.g., "Your vehicle (ABC 1234) has entered the campus" or "Your vehicle was flagged during ANPR scan. Please verify your registration").

### 7. Manual Security Intervention (Feedback Loop)
Security personnel operating the frontend dashboard can interact with the flagged anomalies:
* **`resolve` / `dismiss`:** Clear false positives or resolved issues.
* **`escalate`:** Promote a simple "unregistered anomaly" into a formal "security breach". 
* **`correct_plate`:** If the OCR misread a character (e.g., read an `8` as a `B`), security can manually correct the plate text. The system will cleanly backtrack, update the `AnprPlateCapture`, re-run the entire classification engine on the corrected plate, update the entry logs, toggle the entry/exit state properly, and resolve the open anomaly.
