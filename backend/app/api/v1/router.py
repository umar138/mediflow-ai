from fastapi import APIRouter
from app.api.v1 import auth, public, staff, ws, patient, hospital

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(public.router)
api_router.include_router(staff.router)
api_router.include_router(ws.router)
api_router.include_router(patient.router)
api_router.include_router(hospital.router)
