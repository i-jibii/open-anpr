"""
Database initializer for OpenANPR.

Run this ONCE after creating the PostgreSQL database:
    python init_db.py

It will create all tables defined in the models package.
"""
import sys
import os

# Make sure the backend/ directory is on the Python path
sys.path.insert(0, os.path.dirname(__file__))

from app.utils.database import engine, Base

# Import all models so SQLAlchemy knows about them
import app.models  # noqa: F401


def init():
    print("Creating OpenANPR database tables...")
    Base.metadata.create_all(bind=engine)
    print("Done! Tables created:")
    for table_name in Base.metadata.tables:
        print(f"  [OK] {table_name}")


if __name__ == "__main__":
    init()
