"""Startup validation and URL derivation for employee auth mode."""

from __future__ import annotations

from urllib.parse import SplitResult, urlsplit, urlunsplit

INTROSPECTION_PATH = "/office/v1/auth/employee/introspect"
_ALLOWED_MODES = frozenset({"disabled", "employee"})


def normalize_employee_auth_mode(raw: str | None) -> str:
    value = (raw or "disabled").strip().lower()
    if value not in _ALLOWED_MODES:
        raise RuntimeError(
            "CONFIGURATOR_EMPLOYEE_AUTH_MODE must be 'disabled' or 'employee'"
        )
    return value


def derive_introspection_url(
    *,
    core_office_api_url: str | None,
    override_url: str | None,
) -> str | None:
    if override_url:
        return canonicalize_introspection_url(override_url)
    if core_office_api_url:
        return derive_introspection_url_from_core_office_api_url(core_office_api_url)
    return None


def canonicalize_introspection_url(raw_url: str) -> str:
    parsed = _validated_url_parts(raw_url)
    if parsed.path != INTROSPECTION_PATH:
        raise RuntimeError(
            f"employee introspection URL must use the exact {INTROSPECTION_PATH} path"
        )
    return urlunsplit((parsed.scheme, parsed.netloc, INTROSPECTION_PATH, "", ""))


def derive_introspection_url_from_core_office_api_url(core_office_api_url: str) -> str:
    parsed = _validated_url_parts(core_office_api_url)
    if parsed.path not in {"", "/"}:
        raise RuntimeError("CORE_OFFICE_API_URL must not include a path")
    return urlunsplit((parsed.scheme, parsed.netloc, INTROSPECTION_PATH, "", ""))


def _validated_url_parts(raw_url: str) -> SplitResult:
    parsed = urlsplit(raw_url)
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("employee introspection URL must use http or https")
    if not parsed.hostname:
        raise RuntimeError("employee introspection URL must include a hostname")
    if parsed.username or parsed.password:
        raise RuntimeError("employee introspection URL must not include credentials")
    if parsed.query:
        raise RuntimeError("employee introspection URL must not include a query")
    if parsed.fragment:
        raise RuntimeError("employee introspection URL must not include a fragment")
    if "%" in parsed.path:
        raise RuntimeError("employee introspection URL must not use percent-encoding")
    if "//" in parsed.path:
        raise RuntimeError(
            "employee introspection URL must not contain duplicate slashes"
        )
    return parsed


def validate_employee_auth_settings(
    *,
    configurator_employee_auth_mode: str,
    core_employee_introspection_url: str | None,
    core_office_api_url: str | None,
    employee_introspection_service_token: str | None,
    configurator_handoff_service_token: str | None = None,
    core_office_api_token: str | None = None,
) -> None:
    if configurator_employee_auth_mode != "employee":
        return
    if not core_employee_introspection_url and not core_office_api_url:
        raise RuntimeError(
            "employee auth mode requires CORE_EMPLOYEE_INTROSPECTION_URL or "
            "CORE_OFFICE_API_URL"
        )
    derive_introspection_url(
        core_office_api_url=core_office_api_url,
        override_url=core_employee_introspection_url,
    )
    if not employee_introspection_service_token:
        raise RuntimeError(
            "employee auth mode requires EMPLOYEE_INTROSPECTION_SERVICE_TOKEN"
        )
    handoff_token = (configurator_handoff_service_token or "").strip()
    office_token = (core_office_api_token or "").strip()
    if handoff_token and office_token and handoff_token == office_token:
        raise RuntimeError(
            "CONFIGURATOR_HANDOFF_SERVICE_TOKEN must differ from CORE_OFFICE_API_TOKEN"
        )
