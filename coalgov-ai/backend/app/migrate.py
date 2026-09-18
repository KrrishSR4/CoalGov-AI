from pathlib import Path
from alembic import command
from alembic.config import Config
from .init_db import initialize
from .config import settings

if __name__ == "__main__":
    command.upgrade(Config(str(Path(__file__).resolve().parents[1]/"alembic.ini")),"head")
    initialize(seed=settings.seed_demo)
    print("Database migrated and ready")
