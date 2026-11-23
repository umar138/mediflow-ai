from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.services.ws_manager import ws_manager
from app.core.security import decode_access_token

router = APIRouter(prefix="/api/v1/doctor/ws", tags=["doctor-ws"])


@router.websocket("/listen")
async def doctor_ws(
    websocket: WebSocket,
    token: str = Query(default=None)
):
    auth_token = token or websocket.query_params.get("token")
    if not auth_token:
        auth_header = websocket.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            auth_token = auth_header.split(" ", 1)[1].strip()

    payload = decode_access_token(auth_token) if auth_token else None
    if not payload:
        await websocket.close(code=1008)
        return

    user_id = str(payload.get("sub", "doctor"))
    await ws_manager.connect_doctor(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_doctor(user_id, websocket)
