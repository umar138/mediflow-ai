from typing import Dict, Set
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.staff_connections: Dict[str, Set[WebSocket]] = {}
        self.display_connections: Dict[str, Set[WebSocket]] = {}
        self.ticket_connections: Dict[str, Set[WebSocket]] = {}
        self.doctor_connections: Dict[str, Set[WebSocket]] = {}
        # Map display_token -> clinic_id so we can broadcast across all displays in a clinic
        self.display_to_clinic: Dict[str, str] = {}

    async def connect_doctor(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.doctor_connections.setdefault(user_id, set()).add(websocket)

    def disconnect_doctor(self, user_id: str, websocket: WebSocket):
        if user_id in self.doctor_connections:
            self.doctor_connections[user_id].discard(websocket)

    async def broadcast_doctor(self, user_id: str, message: dict):
        conns = list(self.doctor_connections.get(user_id, set()))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_doctor(user_id, ws)

    async def broadcast_all_doctors(self, message: dict):
        for user_id in list(self.doctor_connections.keys()):
            await self.broadcast_doctor(user_id, message)

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
        # Also broadcast to all active doctor dashboard websockets
        await self.broadcast_all_doctors(message)

    async def connect_display(self, display_token: str, websocket: WebSocket, clinic_id: str = ""):
        await websocket.accept()
        self.display_connections.setdefault(display_token, set()).add(websocket)
        if clinic_id:
            self.display_to_clinic[display_token] = clinic_id

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

    async def broadcast_all_displays_for_clinic(self, clinic_id: str, message: dict):
        for token, c_id in self.display_to_clinic.items():
            if c_id == clinic_id:
                await self.broadcast_display(token, message)
        # Also broadcast to any display connection
        for token in list(self.display_connections.keys()):
            await self.broadcast_display(token, message)

    async def connect_ticket(self, tracking_token: str, websocket: WebSocket):
        await websocket.accept()
        self.ticket_connections.setdefault(tracking_token, set()).add(websocket)

    def disconnect_ticket(self, tracking_token: str, websocket: WebSocket):
        if tracking_token in self.ticket_connections:
            self.ticket_connections[tracking_token].discard(websocket)

    async def broadcast_ticket(self, tracking_token: str, message: dict):
        conns = list(self.ticket_connections.get(tracking_token, set()))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_ticket(tracking_token, ws)


ws_manager = ConnectionManager()
manager = ws_manager
