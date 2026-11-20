from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["realtime"])


@router.websocket("/ws/clinics/{clinic_id}")
async def staff_clinic_ws(websocket: WebSocket, clinic_id: str):
    await ws_manager.connect_staff(clinic_id, websocket)
    try:
        await websocket.send_json({
            "type": "snapshot",
            "clinic_id": clinic_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_staff(clinic_id, websocket)


@router.websocket("/ws/public-display/{display_token}")
async def public_display_ws(websocket: WebSocket, display_token: str):
    await ws_manager.connect_display(display_token, websocket)
    try:
        await websocket.send_json({
            "type": "display.updated",
            "display_token": display_token,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_display(display_token, websocket)