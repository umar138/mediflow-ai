import os, sys
sys.path.append(os.path.abspath('backend/app'))
from app.db.base import Base
from app.db.session import engine
print('Creating all tables...')
Base.metadata.create_all(bind=engine)
print('Done')
