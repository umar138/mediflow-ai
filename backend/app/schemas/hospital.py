import uuid
from typing import Optional, List
from pydantic import BaseModel


class DoctorOut(BaseModel):
    doctor_id: uuid.UUID
    hospital_id: uuid.UUID
    email: str
    full_name: str
    specialization_id: uuid.UUID
    specialization_name: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class HospitalOut(BaseModel):
    hospital_id: uuid.UUID
    slug: str
    name: str
    is_active: bool = True
    doctors: Optional[List[DoctorOut]] = None

    class Config:
        from_attributes = True
