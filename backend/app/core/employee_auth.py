"""Employee authentication dependencies for Configurator BFF routes."""

from __future__ import annotations

import logging

from fastapi import Request

from app.core.config import settings
from app.core.employee_auth_config import derive_introspection_url
from app.core.employee_errors import (
    browser_actor_spoof_rejected,
    employee_application_access_denied,
    employee_authentication_required,
    employee_introspection_unavailable,
    employee_permission_denied,
)
from app.core.employee_session_cookie import parse_employee_session_cookie
from app.models.employee_principal import AuthenticatedEmployeePrincipal
from app.services.employee_introspection_client import (
    EmployeeIntrospectionClient,
    EmployeeIntrospectionResult,
)

_log = logging.getLogger(__name__)

_BROWSER_ACTOR_SPOOF_FIELDS = frozenset(
    {
        "account_id",
        "actor",
        "actor_id",
        "effective_permissions",
        "permissions",
        "role",
    }
)


def employee_auth_enabled() -> bool:
    return settings.configurator_employee_auth_mode == "employee"


def build_introspection_client() -> EmployeeIntrospectionClient:
    endpoint = derive_introspection_url(
        core_office_api_url=settings.core_office_api_url,
        override_url=settings.core_employee_introspection_url,
    )
    token = settings.employee_introspection_service_token
    if endpoint is None or token is None:
        raise RuntimeError("employee introspection is not configured")
    return EmployeeIntrospectionClient(
        endpoint_url=endpoint,
        service_token=token,
    )


def reject_browser_actor_fields(body: dict[str, object]) -> None:
    if not employee_auth_enabled():
        return
    if _BROWSER_ACTOR_SPOOF_FIELDS.intersection(body.keys()):
        raise browser_actor_spoof_rejected()


def resolve_employee_principal(request: Request) -> AuthenticatedEmployeePrincipal:
    session_token = resolve_employee_session_token(request)
    if session_token is None:
        raise employee_authentication_required()

    result = build_introspection_client().introspect(session_token)
    return _principal_from_introspection(result)


def resolve_employee_session_token(request: Request) -> str | None:
    session_token = parse_employee_session_cookie(request.headers.getlist("cookie"))
    if session_token is None or session_token == "malformed":
        return None
    return session_token


def require_authenticated_employee(request: Request) -> AuthenticatedEmployeePrincipal:
    if not employee_auth_enabled():
        raise RuntimeError("employee auth is disabled")
    return resolve_employee_principal(request)


def require_employee_permission(
    principal: AuthenticatedEmployeePrincipal,
    permission_code: str,
) -> None:
    if not principal.has_permission(permission_code):
        _log.info(
            "employee_permission_denied account_id=%s permission=%s",
            principal.account_id,
            permission_code,
        )
        raise employee_permission_denied()


def _principal_from_introspection(
    result: EmployeeIntrospectionResult,
) -> AuthenticatedEmployeePrincipal:
    if result.kind == "authenticated" and result.principal is not None:
        return result.principal
    if result.kind == "unauthenticated":
        raise employee_authentication_required()
    if result.kind == "application_denied":
        raise employee_application_access_denied()
    if result.kind in {"service_auth_failure", "contract_failure", "unavailable"}:
        raise employee_introspection_unavailable()
    raise employee_introspection_unavailable()
