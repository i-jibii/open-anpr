from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.utils.rate_limit import limiter
from app.api import public
from app.services.alerts_ws import alerts_ws_manager

app = FastAPI(
    title="OpenANPR API",
    description="Public Automatic Number Plate Recognition system — portfolio edition",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Security Headers ──────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# ── CORS ──────────────────────────────────────────────────────────────────────
# Locked to local dev by default. Vercel domain must be added here for prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(public.router, prefix="/api/public", tags=["Public ANPR"])


# ── Root & Health ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "OpenANPR API is running", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/detections")
async def ws_detections(websocket: WebSocket):
    """
    Real-time WebSocket endpoint. The React Detection page connects here
    to receive live detection events as they are processed.
    """
    await alerts_ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive by accepting ping messages from the client.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        alerts_ws_manager.disconnect(websocket)
