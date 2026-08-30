# OpenANPR — Portfolio Edition

A public-facing, session-isolated ANPR (Automatic Number Plate Recognition) system built for portfolio demonstration.

## Tech Stack
- **Backend:** Python / FastAPI / SQLAlchemy / PostgreSQL
- **Frontend:** React 18 / Vite / React Router

## Quick Start

### 1. Prerequisites
- Python 3.10+
- PostgreSQL (already installed from the campus system)
- Node.js 18+

### 2. Backend Setup

The virtual environment and packages are already installed.
Just make sure PostgreSQL is running, then:

```cmd
cd C:\Portfolio\open-anpr\backend

REM (first time only) Create the database and tables:
venv\Scripts\python.exe create_db.py
venv\Scripts\python.exe init_db.py

REM Start the server:
venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Frontend Setup

```cmd
cd C:\Portfolio\open-anpr\frontend
npm run dev
```

### 4. Or run both at once (Windows)

```cmd
C:\Portfolio\open-anpr\run.bat
```

### Access
| Service | URL |
|---------|-----|
| Frontend | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:8000 |
| API Docs | http://127.0.0.1:8000/docs |

## How It Works

- Each visitor's browser generates a UUID (`session_id`) stored in `localStorage`
- Every API request sends this ID in the `X-Session-ID` header
- The backend scopes all data to that session — vehicles, detections, and logs are 100% isolated between users
- Multiple simultaneous sessions are supported — completely stateless

## How to Use (for portfolio viewers)

1. **Register** — Go to Register Vehicle, add a plate number (approved/blacklisted/expired for testing)
2. **Detect** — Go to Detection, start the camera (rear camera on mobile, webcam on PC), type a plate, and hit Detect
3. **Logs** — View all your scan history with filter tabs

## Database Schema

Two tables only:
- `session_vehicles` — Plates registered per session
- `session_logs` — Detection results per session
