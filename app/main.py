from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

import config
from database import Base, engine, SessionLocal
from models import Admin
from security import hash_password
from routers import voter, admin

app = FastAPI(title='Voting', docs_url=None, redoc_url=None)
app.add_middleware(SessionMiddleware, secret_key=config.SECRET_KEY,
                   max_age=config.SESSION_MAX_AGE)

Base.metadata.create_all(engine)

# akun admin awal, wajib ganti password setelah login pertama (menu Akun)
SEED_ADMINS = [
    ('admin1', 'admin12345'),
    ('admin2', 'admin12345'),
    ('admin3', 'admin12345'),
]

db = SessionLocal()
for username, pw in SEED_ADMINS:
    if not db.query(Admin).filter_by(username=username).first():
        db.add(Admin(username=username, password_hash=hash_password(pw)))
db.commit()
db.close()

app.mount('/static', StaticFiles(directory='static'), name='static')

app.include_router(voter.router)
app.include_router(admin.router)
