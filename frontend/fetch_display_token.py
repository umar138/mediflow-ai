import os, sys
sys.path.append(os.path.abspath('backend/app'))
from app.db.session import SessionLocal
from app.models.entities import DisplayAccessToken

def main():
    with SessionLocal() as db:
        token = db.query(DisplayAccessToken).first()
        if token:
            print('DISPLAY_TOKEN=' + token.display_token)
        else:
            print('No display token found')

if __name__ == '__main__':
    main()
