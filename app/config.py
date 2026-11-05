import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL', 'mysql+pymysql://root:password@localhost/voting')
SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-ganti-di-produksi')
SESSION_MAX_AGE = int(os.getenv('SESSION_MAX_AGE', '28800'))
