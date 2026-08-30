import sys
import os

os.environ["GRADIO_ANALYTICS_ENABLED"] = "False"

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import gradio as gr
import spaces

# ── ZeroGPU dummy function ──────────────────────────────────────────────────
# This function exists ONLY to satisfy Hugging Face's ZeroGPU requirement.
# Our actual ML inference runs on CPU through FastAPI endpoints.
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

# ── Mount FastAPI routes onto Gradio's internal app ──────────────────────────
# We must use demo.launch() for ZeroGPU to work. Before that, we hook into
# Gradio's app creation to inject our FastAPI routes.
from backend.app.main import app as fastapi_app
import gradio.routes

_original_create_app = gradio.routes.App.create_app

@classmethod  
def _patched_create_app(cls, blocks, *args, **kwargs):
    """Inject our FastAPI routes into the Gradio app during creation."""
    gradio_app = _original_create_app(blocks, *args, **kwargs)
    
    # Copy all routes from our FastAPI app into the Gradio app
    for route in fastapi_app.routes:
        gradio_app.routes.append(route)
    
    # Copy middleware (CORS, security headers, rate limiting)
    for middleware in reversed(fastapi_app.user_middleware):
        gradio_app.add_middleware(middleware.cls, **middleware.kwargs)
    
    # Copy exception handlers
    for exc, handler in fastapi_app.exception_handlers.items():
        gradio_app.add_exception_handler(exc, handler)
    
    # Copy state (rate limiter)
    gradio_app.state.limiter = getattr(fastapi_app.state, 'limiter', None)
    
    return gradio_app

gradio.routes.App.create_app = _patched_create_app

# ── Launch via Gradio (REQUIRED for ZeroGPU) ─────────────────────────────────
# This is the ONLY way to satisfy ZeroGPU's startup detection.
# Do NOT use uvicorn.run() — it bypasses Gradio's GPU allocation system.
demo.launch(server_name="0.0.0.0", server_port=7860)
