import os
from pathlib import Path

_cors_default = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", _cors_default)
    return [o.strip() for o in raw.split(",") if o.strip()]


class Settings:
    cors_origins: list[str] = _cors_origins()
    items_json_path: Path = Path(__file__).resolve().parent.parent / "data" / "items.json"


settings = Settings()
