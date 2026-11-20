from typing import Dict, Set
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.staff_connections: Dict[str, Set[WebSocket]] = {}
        self.display_connections: Dict[str, Set[WebSocket]] = {}

    async def connect_staff(self, clinic_id: str, websocket: WebSocket):
        await websocket.accept()
        self.staff_connections.setdefault(clinic_id, set()).add(websocket)

    def disconnect_staff(self, clinic_id: str, websocket: WebSocket):
        if clinic_id in self.staff_connections:
            self.staff_connections[clinic_id].discard(websocket)

    async def broadcast_staff(self, clinic_id: str, message: dict):
        conns = list(self.staff_connections.get(clinic_id, set()))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_staff(clinic_id, ws)

    async def connect_display(self, display_token: str, websocket: WebSocket):
        await websocket.accept()
        self.display_connections.setdefault(display_token, set()).add(websocket)

    def disconnect_display(self, display_token: str, websocket: WebSocket):
        if display_token in self.display_connections:
            self.display_connections[display_token].discard(websocket)

    async def broadcast_display(self, display_token: str, message: dict):
        conns = list(self.display_connections.get(display_token, set()))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_display(display_token, ws)


ws_manager = ConnectionManager()