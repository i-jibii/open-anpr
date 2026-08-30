import sys
import os

os.environ["GRADIO_ANALYTICS_ENABLED"] = "False"

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import gradio as gr
from backend.app.main import app as fastapi_app

# Create a minimalist Gradio interface to satisfy Hugging Face's SDK requirement
demo = gr.Blocks()
with demo:
    gr.Markdown("# OpenANPR API")
    gr.Markdown("The FastAPI backend is actively running on this Space.")
    gr.Markdown("API Endpoints are available at `/api/public/...`")

# Mount the FastAPI app at the root, moving the dummy Gradio UI to /gradio
# Hugging Face will automatically detect the 'app' variable and serve it.
app = gr.mount_gradio_app(fastapi_app, demo, path="/gradio")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
