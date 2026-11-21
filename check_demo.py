import sys, os
sys.path.append('backend')
from app.db.session import SessionLocal
from app.models.entities import Clinic, DisplayAccessToken

db = SessionLocal()
clinic = db.query(Clinic).filter(Clinic.slug == 'mediflow-demo').first()
print('Clinic:', clinic)
if clinic:
    token = db.query(DisplayAccessToken).filter(DisplayAccessToken.clinic_id == clinic.clinic_id, DisplayAccessToken.is_active==True).first()
    print('DisplayAccessToken:', token)
