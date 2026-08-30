import sys
import os

os.environ["GRADIO_ANALYTICS_ENABLED"] = "False"

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import gradio as gr
import spaces

# ── ZeroGPU dummy function ──────────────────────────────────────────────────
@spaces.GPU
def gpu_status_check():
    return "ZeroGPU is active. FastAPI backend is running."

# ── Gradio UI (minimal, required by HF) ─────────────────────────────────────
demo = gr.Blocks()
with demo:
    gr.Markdown("# 🚘 OpenANPR API Backend")
    gr.Markdown("The FastAPI backend is actively running on this Space.")
    gr.Markdown("API Endpoints: `/api/public/...` — [Swagger Docs](/docs)")
    btn = gr.Button("Check ZeroGPU Status")
    out = gr.Textbox(label="Status")
    btn.click(fn=gpu_status_check, inputs=[], outputs=[out])

# ── Inject our API routes into Gradio's internal app ─────────────────────────
# We mount ONLY the router (not the full FastAPI app) to avoid template conflicts.
import gradio.routes

_original_create_app = gradio.routes.App.create_app

@classmethod
def _patched_create_app(cls, blocks, *args, **kwargs):
    """Add our FastAPI API routes into the Gradio app cleanly."""
    gradio_app = _original_create_app(blocks, *args, **kwargs)

    # Import only what we need — no conflicting middleware
    from app.api.public import router as public_router
    from app.utils.rate_limit import limiter
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from app.services.alerts_ws import alerts_ws_manager
    from fastapi import WebSocket, WebSocketDisconnect

    # Rate limiter
    gradio_app.state.limiter = limiter
    gradio_app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Mount our API router at /api/public
    gradio_app.include_router(public_router, prefix="/api/public", tags=["Public ANPR"])

    # Health check endpoint
    @gradio_app.get("/health")
    def health():
        return {"status": "healthy"}

    # Swagger docs endpoint
    @gradio_app.get("/docs", include_in_schema=False)
    async def custom_docs():
        from fastapi.openapi.docs import get_swagger_ui_html
        return get_swagger_ui_html(openapi_url="/openapi.json", title="OpenANPR API")

    # WebSocket for live detections
    @gradio_app.websocket("/ws/detections")
    async def ws_detections(websocket: WebSocket):
        await alerts_ws_manager.connect(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            alerts_ws_manager.disconnect(websocket)

    return gradio_app

gradio.routes.App.create_app = _patched_create_app

# ── Launch via Gradio (REQUIRED for ZeroGPU) ─────────────────────────────────
demo.launch(server_name="0.0.0.0", server_port=7860, share=False)
