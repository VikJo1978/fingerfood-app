"""Core employee-session introspection client for Configurator BFF."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Literal

import httpx

from app.core.employee_auth_config import canonicalize_introspection_url
from app.models.employee_principal import AuthenticatedEmployeePrincipal

_log = logging.getLogger(__name__)

_ALLOWED_ROLES = frozenset({"SUPERADMIN", "ADMIN", "USER", "VIEWER"})
_MAX_RESPONSE_BYTES = 64 * 1024
_CONNECT_TIMEOUT_SECONDS = 2.0
_READ_TIMEOUT_SECONDS = 5.0

IntrospectionOutcomeKind = Literal[
    "authenticated",
    "unauthenticated",
    "application_denied",
    "service_auth_failure",
    "contract_failure",
    "unavailable",
]


@dataclass(frozen=True)
class EmployeeIntrospectionResult:
    kind: IntrospectionOutcomeKind
    principal: AuthenticatedEmployeePrincipal | None = None


class EmployeeIntrospectionClient:
    def __init__(
        self,
        *,
        endpoint_url: str,
        service_token: str,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._endpoint_url = canonicalize_introspection_url(endpoint_url)
        self._service_token = service_token
        self._transport = transport

    def introspect(self, employee_session_token: str) -> EmployeeIntrospectionResult:
        started = time.monotonic()
        try:
            with httpx.Client(
                transport=self._transport,
                follow_redirects=False,
                timeout=httpx.Timeout(
                    connect=_CONNECT_TIMEOUT_SECONDS,
                    read=_READ_TIMEOUT_SECONDS,
                    write=_READ_TIMEOUT_SECONDS,
                    pool=_CONNECT_TIMEOUT_SECONDS,
                ),
                verify=True,
            ) as client:
                response = client.post(
                    self._endpoint_url,
                    headers={
                        "Authorization": f"Bearer {self._service_token}",
                        "X-Employee-Session": employee_session_token,
                        "Content-Length": "0",
                    },
                )
        except httpx.HTTPError:
            _log.warning(
                "employee_introspect outcome=unavailable latency_ms=%.1f",
                (time.monotonic() - started) * 1000,
            )
            return EmployeeIntrospectionResult(kind="unavailable")

        latency_ms = (time.monotonic() - started) * 1000
        if response.status_code in {401, 403}:
            _log.error(
                "employee_introspect outcome=service_auth_failure status=%s latency_ms=%.1f",
                response.status_code,
                latency_ms,
            )
            return EmployeeIntrospectionResult(kind="service_auth_failure")
        if response.status_code == 400:
            _log.error(
                "employee_introspect outcome=contract_failure status=400 latency_ms=%.1f",
                latency_ms,
            )
            return EmployeeIntrospectionResult(kind="contract_failure")
        if response.status_code >= 500:
            _log.warning(
                "employee_introspect outcome=unavailable status=%s latency_ms=%.1f",
                response.status_code,
                latency_ms,
            )
            return EmployeeIntrospectionResult(kind="unavailable")
        if response.status_code != 200:
            _log.warning(
                "employee_introspect outcome=unavailable status=%s latency_ms=%.1f",
                response.status_code,
                latency_ms,
            )
            return EmployeeIntrospectionResult(kind="unavailable")

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type.lower():
            _log.error(
                "employee_introspect outcome=contract_failure reason=content_type latency_ms=%.1f",
                latency_ms,
            )
            return EmployeeIntrospectionResult(kind="contract_failure")

        raw = response.content
        if len(raw) > _MAX_RESPONSE_BYTES:
            _log.error(
                "employee_introspect outcome=contract_failure reason=response_size latency_ms=%.1f",
                latency_ms,
            )
            return EmployeeIntrospectionResult(kind="contract_failure")

        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            _log.error(
                "employee_introspect outcome=contract_failure reason=json latency_ms=%.1f",
                latency_ms,
            )
            return EmployeeIntrospectionResult(kind="contract_failure")

        parsed = _parse_introspection_payload(payload)
        if parsed.kind == "authenticated" and parsed.principal is not None:
            _log.info(
                "employee_introspect outcome=authenticated account_id=%s latency_ms=%.1f",
                parsed.principal.account_id,
                latency_ms,
            )
        else:
            _log.info(
                "employee_introspect outcome=%s latency_ms=%.1f",
                parsed.kind,
                latency_ms,
            )
        return parsed


def _parse_introspection_payload(payload: object) -> EmployeeIntrospectionResult:
    if not isinstance(payload, dict):
        return EmployeeIntrospectionResult(kind="contract_failure")

    authenticated = payload.get("authenticated")
    application_access_allowed = payload.get("application_access_allowed")
    principal_raw = payload.get("principal")

    if not isinstance(authenticated, bool) or not isinstance(
        application_access_allowed, bool
    ):
        return EmployeeIntrospectionResult(kind="contract_failure")

    if not authenticated:
        return EmployeeIntrospectionResult(kind="unauthenticated")

    if not application_access_allowed:
        return EmployeeIntrospectionResult(kind="application_denied")

    if principal_raw is None or not isinstance(principal_raw, dict):
        return EmployeeIntrospectionResult(kind="contract_failure")

    account_id = principal_raw.get("account_id")
    username = principal_raw.get("username")
    display_name = principal_raw.get("display_name")
    role = principal_raw.get("role")
    permissions_raw = principal_raw.get("effective_permissions")

    if (
        not isinstance(account_id, str)
        or not account_id.strip()
        or not isinstance(username, str)
        or not isinstance(display_name, str)
        or not isinstance(role, str)
        or role not in _ALLOWED_ROLES
        or not isinstance(permissions_raw, list)
    ):
        return EmployeeIntrospectionResult(kind="contract_failure")

    permissions: list[str] = []
    seen: set[str] = set()
    for entry in permissions_raw:
        if not isinstance(entry, str) or not entry:
            return EmployeeIntrospectionResult(kind="contract_failure")
        if entry not in seen:
            seen.add(entry)
            permissions.append(entry)

    principal = AuthenticatedEmployeePrincipal(
        account_id=account_id,
        username=username,
        display_name=display_name,
        role=role,  # type: ignore[arg-type]
        effective_permissions=frozenset(permissions),
    )
    return EmployeeIntrospectionResult(kind="authenticated", principal=principal)
