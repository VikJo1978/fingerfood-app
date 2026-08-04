import os
from pathlib import Path

from app.core.employee_auth_config import normalize_employee_auth_mode

_cors_default = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"


def _optional_env(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


def _optional_path_env(name: str) -> Path | None:
    value = _optional_env(name)
    return Path(value).expanduser() if value is not None else None


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", _cors_default)
    return [o.strip() for o in raw.split(",") if o.strip()]


class Settings:
    cors_origins: list[str] = _cors_origins()
    items_json_path: Path = (
        Path(__file__).resolve().parent.parent / "data" / "items.json"
    )
    core_office_api_url: str | None = _optional_env("CORE_OFFICE_API_URL")
    core_office_api_token: str | None = _optional_env("CORE_OFFICE_API_TOKEN")
    core_office_panel_url: str | None = _optional_env("CORE_OFFICE_PANEL_URL")
    fingerfood_api_token: str | None = _optional_env("FINGERFOOD_API_TOKEN")
    frontend_dist_path: Path | None = _optional_path_env("FINGERFOOD_FRONTEND_DIST")
    catalog_adapter_strict: bool = (
        os.getenv("CATALOG_ADAPTER_STRICT", "").strip() == "1"
    )
    configurator_employee_auth_mode: str = normalize_employee_auth_mode(
        os.getenv("CONFIGURATOR_EMPLOYEE_AUTH_MODE")
    )
    employee_introspection_service_token: str | None = _optional_env(
        "EMPLOYEE_INTROSPECTION_SERVICE_TOKEN"
    )
    core_employee_introspection_url: str | None = _optional_env(
        "CORE_EMPLOYEE_INTROSPECTION_URL"
    )
    configurator_csrf_cookie_secure: bool = (
        os.getenv("CONFIGURATOR_CSRF_COOKIE_SECURE", "").strip() == "1"
    )


settings = Settings()
