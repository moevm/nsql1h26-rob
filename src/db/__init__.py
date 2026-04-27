"""База данных: конфиг, подключение, схемы, инициализация."""

from src.db.database import get_client, get_db

__all__ = ["get_client", "get_db"]
