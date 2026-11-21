import sys
import os
sys.path.append(os.path.abspath('backend/app'))
from app.db.session import SessionLocal
from app.models.entities import Clinic

def main():
    with SessionLocal() as db:
        clinics = db.query(Clinic).all()
        print('Clinics count:', len(clinics))
        for c in clinics:
            print(c.clinic_id, c.slug, c.is_active)

if __name__ == '__main__':
    main()
