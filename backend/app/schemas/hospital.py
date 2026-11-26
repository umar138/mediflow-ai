from typing import Optional, List
from pydantic import BaseModel


class DoctorOut(BaseModel):
    doctor_id: int
    hospital_id: int
    email: str
    full_name: str
    specialization_id: int
    specialization_name: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class HospitalOut(BaseModel):
    hospital_id: int
    slug: str
    name: str
    is_active: bool = True
    doctors: Optional[List[DoctorOut]] = None

    class Config:
        from_attributes = True
