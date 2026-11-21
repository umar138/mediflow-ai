import os, sys
sys.path.append(os.path.abspath('backend/app'))
from app.db.session import SessionLocal
from app.models.entities import Clinic

def main():
    with SessionLocal() as db:
        clinics = db.query(Clinic).all()
        print('Clinics count:', len(clinics))
        for c in clinics:
            print('ID:', c.clinic_id, 'slug:', c.slug, 'active:', c.is_active)

if __name__ == '__main__':
    main()
