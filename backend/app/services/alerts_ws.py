"""
WebSocket broadcast manager for real-time detection events.
Identical pattern to the campus system's alerts_ws.py.
"""
from typing import List
from fastapi import WebSocket


class AlertsWSManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        """Send a JSON message to all currently connected WebSocket clients."""
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


alerts_ws_manager = AlertsWSManager()
