"""AUTH-2E2 employee auth, introspection, CSRF, and route separation tests."""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, generate_csrf_token
from app.core.employee_auth_config import (
    INTROSPECTION_PATH,
    canonicalize_introspection_url,
    derive_introspection_url,
    normalize_employee_auth_mode,
    validate_employee_auth_settings,
)
from app.core.employee_session_cookie import (
    EMPLOYEE_SESSION_COOKIE,
    parse_employee_session_cookie,
)
from app.main import app
from app.routes import ui_offer as ui_offer_routes
from app.services.configurator_handoff_context import ConfiguratorPrepareContextStore
from app.services.employee_introspection_client import EmployeeIntrospectionClient
from tests.test_offer_api_auth import _PREPARE_URL, _prepare_body, _TOKEN

_UI_PREPARE_URL = "/api/ui/offer/prepare"
_UI_SESSION_URL = "/api/ui/session"
_INQUIRY_ID = "11111111-1111-4111-8111-111111111111"
_OFFER_ID = "33333333-3333-4333-8333-333333333333"
_SESSION_TOKEN = "validEmployeeSessionToken0123456789abcdef"
_INTROSPECT_TOKEN = "test-introspection-service-token"
_INTROSPECT_URL = "http://core.test/office/v1/auth/employee/introspect"


def _introspection_payload(
    *,
    authenticated: bool = True,
    application_access_allowed: bool = True,
    permissions: list[str] | None = None,
) -> dict[str, object]:
    if not authenticated:
        return {
            "authenticated": False,
            "application_access_allowed": False,
            "principal": None,
        }
    if not application_access_allowed:
        return {
            "authenticated": True,
            "application_access_allowed": False,
            "principal": {
                "account_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "username": "super.admin",
                "display_name": "Super Admin",
                "role": "SUPERADMIN",
                "effective_permissions": [],
            },
        }
    return {
        "authenticated": True,
        "application_access_allowed": True,
        "principal": {
            "account_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "username": "super.admin",
            "display_name": "Super Admin",
            "role": "SUPERADMIN",
            "effective_permissions": permissions
            if permissions is not None
            else ["offers.prepare"],
        },
    }


def _mock_introspection_transport(
    payload: dict[str, object] | None = None,
    *,
    status: int = 200,
    content_type: str = "application/json; charset=utf-8",
    body: bytes | None = None,
) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert str(request.url) == _INTROSPECT_URL
        assert request.headers["Authorization"] == f"Bearer {_INTROSPECT_TOKEN}"
        assert request.headers["X-Employee-Session"] == _SESSION_TOKEN
        assert "Cookie" not in request.headers
        if body is not None:
            return httpx.Response(
                status, content=body, headers={"content-type": content_type}
            )
        return httpx.Response(
            status,
            json=payload,
            headers={"content-type": content_type},
            request=request,
        )

    return httpx.MockTransport(handler)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(
        settings,
        "core_office_panel_url",
        "https://office.example.test",
    )
    monkeypatch.setattr(settings, "configurator_employee_auth_mode", "disabled")
    monkeypatch.setattr(settings, "employee_introspection_service_token", None)
    monkeypatch.setattr(settings, "core_employee_introspection_url", None)
    return TestClient(app)


@pytest.fixture
def employee_client(
    monkeypatch: pytest.MonkeyPatch, tmp_path: pytest.TempPathFactory
) -> TestClient:
    monkeypatch.setattr(
        settings,
        "core_office_panel_url",
        "https://office.example.test",
    )
    monkeypatch.setattr(settings, "configurator_employee_auth_mode", "employee")
    monkeypatch.setattr(
        settings, "employee_introspection_service_token", _INTROSPECT_TOKEN
    )
    monkeypatch.setattr(settings, "core_employee_introspection_url", _INTROSPECT_URL)
    monkeypatch.setattr(
        settings,
        "configurator_handoff_context_db",
        tmp_path / "employee-auth-bff-handoff.sqlite3",
    )
    return TestClient(app)


def _enable_employee_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "configurator_employee_auth_mode", "employee")
    monkeypatch.setattr(
        settings, "employee_introspection_service_token", _INTROSPECT_TOKEN
    )
    monkeypatch.setattr(settings, "core_employee_introspection_url", _INTROSPECT_URL)


def _patch_introspection(
    monkeypatch: pytest.MonkeyPatch,
    payload: dict[str, object],
) -> None:
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport(payload),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )


def _session_cookies(token: str = _SESSION_TOKEN) -> dict[str, str]:
    return {EMPLOYEE_SESSION_COOKIE: token}


def _csrf_headers(token: str) -> dict[str, str]:
    return {CSRF_HEADER_NAME: token}


def _employee_prepare_body() -> dict[str, object]:
    context = ConfiguratorPrepareContextStore(
        settings.configurator_handoff_context_db
    ).create(
        account_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer={
            "planning": {
                "persons": 10,
                "budget": None,
                "budgetEnabled": False,
                "desiredModules": [],
                "dietaryRequirements": "",
                "eventType": "",
                "serviceStyle": "",
            },
            "orderContextPrefill": {
                "companyName": "Example GmbH",
                "contactPerson": "Contact",
                "email": "a@example.invalid",
                "phone": "",
                "eventDate": "2026-08-20",
                "eventTime": "18:00–22:00",
                "location": "Hamburg",
                "billingAddress": "Street 1",
                "remarks": "",
            },
        },
    )
    body = _prepare_body()
    body["context_id"] = context.context_id
    body.pop("inquiry_id", None)
    return body


def test_disabled_mode_starts_without_introspection_token(client: TestClient) -> None:
    validate_employee_auth_settings(
        configurator_employee_auth_mode=settings.configurator_employee_auth_mode,
        core_employee_introspection_url=settings.core_employee_introspection_url,
        core_office_api_url=settings.core_office_api_url,
        employee_introspection_service_token=settings.employee_introspection_service_token,
        configurator_handoff_service_token=settings.configurator_handoff_service_token,
        core_office_api_token=settings.core_office_api_token,
    )
    response = client.get(_UI_SESSION_URL)
    assert response.status_code == 200
    assert response.json()["employee_auth_mode"] == "disabled"


def test_employee_mode_missing_token_fails_startup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "configurator_employee_auth_mode", "employee")
    monkeypatch.setattr(settings, "employee_introspection_service_token", None)
    monkeypatch.setattr(settings, "core_employee_introspection_url", _INTROSPECT_URL)
    with pytest.raises(RuntimeError, match="EMPLOYEE_INTROSPECTION_SERVICE_TOKEN"):
        validate_employee_auth_settings(
            configurator_employee_auth_mode="employee",
            core_employee_introspection_url=_INTROSPECT_URL,
            core_office_api_url=None,
            employee_introspection_service_token=None,
            configurator_handoff_service_token=None,
            core_office_api_token=None,
        )


def test_employee_mode_missing_url_fails_startup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "configurator_employee_auth_mode", "employee")
    monkeypatch.setattr(
        settings, "employee_introspection_service_token", _INTROSPECT_TOKEN
    )
    monkeypatch.setattr(settings, "core_employee_introspection_url", None)
    with pytest.raises(RuntimeError, match="CORE_EMPLOYEE_INTROSPECTION_URL"):
        validate_employee_auth_settings(
            configurator_employee_auth_mode="employee",
            core_employee_introspection_url=None,
            core_office_api_url=None,
            employee_introspection_service_token=_INTROSPECT_TOKEN,
            configurator_handoff_service_token=None,
            core_office_api_token=None,
        )


def test_equal_handoff_and_core_tokens_fail_startup() -> None:
    with pytest.raises(
        RuntimeError,
        match="CONFIGURATOR_HANDOFF_SERVICE_TOKEN must differ from CORE_OFFICE_API_TOKEN",
    ):
        validate_employee_auth_settings(
            configurator_employee_auth_mode="employee",
            core_employee_introspection_url=_INTROSPECT_URL,
            core_office_api_url=None,
            employee_introspection_service_token=_INTROSPECT_TOKEN,
            configurator_handoff_service_token=" shared-token ",
            core_office_api_token="shared-token",
        )


def test_distinct_handoff_and_core_tokens_allowed() -> None:
    validate_employee_auth_settings(
        configurator_employee_auth_mode="employee",
        core_employee_introspection_url=_INTROSPECT_URL,
        core_office_api_url=None,
        employee_introspection_service_token=_INTROSPECT_TOKEN,
        configurator_handoff_service_token="handoff-token",
        core_office_api_token="core-token",
    )


def test_invalid_mode_rejected() -> None:
    with pytest.raises(RuntimeError, match="CONFIGURATOR_EMPLOYEE_AUTH_MODE"):
        normalize_employee_auth_mode("legacy")


def test_introspection_url_derived_from_core_office_api_url() -> None:
    url = derive_introspection_url(
        core_office_api_url="http://core.test",
        override_url=None,
    )
    assert url == "http://core.test/office/v1/auth/employee/introspect"


@pytest.mark.parametrize(
    ("raw_url", "expected"),
    [
        ("http://core.test/office/v1/auth/employee/introspect", _INTROSPECT_URL),
        (
            "https://core.test/office/v1/auth/employee/introspect",
            "https://core.test/office/v1/auth/employee/introspect",
        ),
    ],
)
def test_canonicalize_introspection_url_accepts_valid_urls(
    raw_url: str, expected: str
) -> None:
    assert canonicalize_introspection_url(raw_url) == expected


@pytest.mark.parametrize(
    "raw_url",
    [
        "http://user:pass@core.test/office/v1/auth/employee/introspect",
        "http://core.test/office/v1/auth/employee/introspect?x=1",
        "http://core.test/office/v1/auth/employee/introspect#frag",
        "http://core.test/other",
        "http://core.test/office/v1/auth/employee/introspect/",
        "http://core.test/%6fffice/v1/auth/employee/introspect",
    ],
)
def test_canonicalize_introspection_url_rejects_invalid_urls(raw_url: str) -> None:
    with pytest.raises(RuntimeError):
        canonicalize_introspection_url(raw_url)


@pytest.mark.parametrize(
    "core_url",
    [
        "http://user:pass@core.test",
        "http://core.test?x=1",
        "http://core.test#frag",
        "http://core.test/api",
    ],
)
def test_invalid_core_office_api_url_rejected(core_url: str) -> None:
    with pytest.raises(RuntimeError):
        derive_introspection_url(core_office_api_url=core_url, override_url=None)


def test_disabled_mode_does_not_require_invalid_introspection_url() -> None:
    validate_employee_auth_settings(
        configurator_employee_auth_mode="disabled",
        core_employee_introspection_url="http://core.test/not-used",
        core_office_api_url=None,
        employee_introspection_service_token=None,
    )


def test_employee_mode_invalid_override_url_fails_startup() -> None:
    with pytest.raises(RuntimeError):
        validate_employee_auth_settings(
            configurator_employee_auth_mode="employee",
            core_employee_introspection_url="http://core.test/not-valid",
            core_office_api_url=None,
            employee_introspection_service_token=_INTROSPECT_TOKEN,
        )


def test_no_cookie_returns_401_in_employee_mode(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload(authenticated=False))
    response = employee_client.post(_UI_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 401
    assert response.json()["detail"] == {"code": "employee_authentication_required"}


def test_no_cookie_and_actor_field_returns_401_before_body_checks(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(_UI_PREPARE_URL, json={"account_id": "spoof-id"})
    assert response.status_code == 401


def test_no_cookie_and_malformed_json_returns_401_not_500(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        content="{not-json",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 401


def test_empty_cookie_returns_401(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload(authenticated=False))
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies={EMPLOYEE_SESSION_COOKIE: "   "},
    )
    assert response.status_code == 401


def test_duplicate_session_cookie_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        headers={
            "Cookie": (
                f"{EMPLOYEE_SESSION_COOKIE}={_SESSION_TOKEN}; "
                f"{EMPLOYEE_SESSION_COOKIE}=other-token"
            )
        },
    )
    assert response.status_code == 401


def test_duplicate_cookie_headers_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        headers=[
            ("Cookie", f"{EMPLOYEE_SESSION_COOKIE}={_SESSION_TOKEN}"),
            ("Cookie", f"{EMPLOYEE_SESSION_COOKIE}=other-token"),
        ],
    )
    assert response.status_code == 401


def test_mixed_unrelated_cookie_and_duplicate_employee_cookie_rejected() -> None:
    assert (
        parse_employee_session_cookie(
            [
                f"other=value; {EMPLOYEE_SESSION_COOKIE}={_SESSION_TOKEN}",
                f"{EMPLOYEE_SESSION_COOKIE}=other-token",
            ]
        )
        == "malformed"
    )


def test_single_valid_employee_cookie_parses() -> None:
    assert (
        parse_employee_session_cookie(
            [f"other=value; {EMPLOYEE_SESSION_COOKIE}={_SESSION_TOKEN}"]
        )
        == _SESSION_TOKEN
    )


def test_unrelated_cookie_without_employee_session_returns_none() -> None:
    assert parse_employee_session_cookie(["other=value"]) is None


def test_malformed_session_cookie_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert (
        parse_employee_session_cookie("sl_employee_session=bad token!") == "malformed"
    )
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies={EMPLOYEE_SESSION_COOKIE: "bad token!"},
    )
    assert response.status_code == 401


def test_oversized_session_cookie_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies={EMPLOYEE_SESSION_COOKIE: "a" * 300},
    )
    assert response.status_code == 401


def test_invalid_cookie_and_malformed_body_returns_401(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        content="{not-json",
        headers={"content-type": "application/json"},
        cookies={EMPLOYEE_SESSION_COOKIE: "bad token!"},
    )
    assert response.status_code == 401


def test_valid_session_forwarded_only_in_x_employee_session_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["session"] = request.headers["X-Employee-Session"]
        assert "Cookie" not in request.headers
        return httpx.Response(
            200,
            json=_introspection_payload(),
            headers={"content-type": "application/json"},
        )

    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    client.introspect(_SESSION_TOKEN)
    assert captured["session"] == _SESSION_TOKEN


def test_authenticated_valid_prepare_allowed(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    core = MagicMock()
    core.is_configured.return_value = True
    core.get_inquiry.return_value = {"inquiry_id": _INQUIRY_ID}
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        lambda body: {"offer_id": _OFFER_ID},
    )
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_employee_prepare_body(),
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: csrf},
        headers=_csrf_headers(csrf),
    )
    assert response.status_code == 200
    assert response.json() == {"offer_id": _OFFER_ID}


def test_authenticated_false_returns_401(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload(authenticated=False))
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 401


def test_application_denied_returns_403(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(
        monkeypatch,
        _introspection_payload(application_access_allowed=False),
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == {"code": "employee_application_access_denied"}


def test_missing_offers_prepare_returns_403(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _introspection_payload(permissions=["inquiries.view"])
    principal = payload["principal"]
    assert isinstance(principal, dict)
    principal["role"] = "USER"
    _patch_introspection(monkeypatch, payload)
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_employee_prepare_body(),
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: csrf},
        headers=_csrf_headers(csrf),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == {"code": "employee_permission_denied"}
    execute.assert_not_called()


def test_superadmin_allowed_without_explicit_permission(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _introspection_payload(permissions=[])
    payload["principal"]["role"] = "SUPERADMIN"  # type: ignore[index]
    _patch_introspection(monkeypatch, payload)
    core = MagicMock()
    core.is_configured.return_value = True
    core.get_inquiry.return_value = {"inquiry_id": _INQUIRY_ID}
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        lambda body: {"offer_id": _OFFER_ID},
    )
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_employee_prepare_body(),
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: csrf},
        headers=_csrf_headers(csrf),
    )
    assert response.status_code == 200


@pytest.mark.parametrize("status", [401, 403])
def test_core_service_auth_failure_returns_503(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch, status: int
) -> None:
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport({}, status=status),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 503
    assert response.json()["detail"] == {"code": "employee_introspection_unavailable"}


def test_core_400_returns_503(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport({}, status=400),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 503


def test_core_500_returns_503(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport({}, status=500),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 503


def test_introspection_unavailable_and_malformed_body_returns_503(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        content="{not-json",
        headers={"content-type": "application/json"},
        cookies=_session_cookies(),
    )
    assert response.status_code == 503


def test_connection_failure_returns_503(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 503


def test_malformed_core_json_returns_503(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport(
            None, body=b"{not-json", content_type="application/json"
        ),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 503


def test_invalid_content_type_returns_503(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport(
            None,
            body=b"ok",
            content_type="text/plain",
        ),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 503


def test_oversized_core_response_returns_503(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport(
            None,
            body=b"x" * (64 * 1024 + 1),
            content_type="application/json",
        ),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 503


def test_browser_actor_spoof_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    body = _prepare_body()
    body["account_id"] = "spoof-id"
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=body,
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: csrf},
        headers=_csrf_headers(csrf),
    )
    assert response.status_code == 400
    assert response.json()["detail"] == {"code": "invalid_request"}


def test_missing_permission_and_actor_field_returns_403_before_body_checks(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _introspection_payload(permissions=["inquiries.view"])
    principal = payload["principal"]
    assert isinstance(principal, dict)
    principal["role"] = "USER"
    _patch_introspection(monkeypatch, payload)
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)
    response = employee_client.post(
        _UI_PREPARE_URL,
        json={"account_id": "spoof-id"},
        cookies=_session_cookies(),
    )
    assert response.status_code == 403
    execute.assert_not_called()


def test_missing_csrf_returns_403(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 403
    assert response.json()["detail"] == {"code": "invalid_csrf"}


def test_missing_csrf_and_malformed_body_returns_403_before_body_checks(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)
    response = employee_client.post(
        _UI_PREPARE_URL,
        content="{not-json",
        headers={"content-type": "application/json"},
        cookies=_session_cookies(),
    )
    assert response.status_code == 403
    execute.assert_not_called()


def test_csrf_mismatch_returns_403(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: "cookie-token"},
        headers=_csrf_headers("header-token"),
    )
    assert response.status_code == 403


def test_duplicate_cookie_headers_rejected_before_csrf(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        headers=[
            (
                "Cookie",
                f"{EMPLOYEE_SESSION_COOKIE}={_SESSION_TOKEN}; {CSRF_COOKIE_NAME}=a",
            ),
            ("Cookie", f"{CSRF_COOKIE_NAME}=a"),
            (CSRF_HEADER_NAME, "a"),
        ],
    )
    assert response.status_code == 401


def test_duplicate_csrf_cookie_names_in_one_header_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        headers={
            "Cookie": (
                f"{EMPLOYEE_SESSION_COOKIE}={_SESSION_TOKEN}; "
                f"{CSRF_COOKIE_NAME}=a; {CSRF_COOKIE_NAME}=b"
            ),
            CSRF_HEADER_NAME: "a",
        },
    )
    assert response.status_code == 403


def test_duplicate_csrf_headers_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        headers=[
            (
                "Cookie",
                f"{EMPLOYEE_SESSION_COOKIE}={_SESSION_TOKEN}; {CSRF_COOKIE_NAME}=a",
            ),
            (CSRF_HEADER_NAME, "a"),
            (CSRF_HEADER_NAME, "b"),
        ],
    )
    assert response.status_code == 403


def test_valid_csrf_allows_prepare(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    core = MagicMock()
    core.is_configured.return_value = True
    core.get_inquiry.return_value = {"inquiry_id": _INQUIRY_ID}
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        lambda body: {"offer_id": _OFFER_ID},
    )
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_employee_prepare_body(),
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: csrf},
        headers=_csrf_headers(csrf),
    )
    assert response.status_code == 200


def test_valid_csrf_and_malformed_json_returns_stable_400(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        content="{not-json",
        headers={"content-type": "application/json", **_csrf_headers(csrf)},
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: csrf},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == {"code": "invalid_request"}
    execute.assert_not_called()


def test_valid_csrf_and_invalid_pydantic_shape_returns_stable_422(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        json={"inquiry_id": _INQUIRY_ID},
        headers=_csrf_headers(csrf),
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: csrf},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == {"code": "invalid_request"}
    execute.assert_not_called()


def test_oversized_body_returns_413(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        content=b"x" * (64 * 1024 + 1),
        headers={"content-type": "application/json", **_csrf_headers(csrf)},
        cookies={**_session_cookies(), CSRF_COOKIE_NAME: csrf},
    )
    assert response.status_code == 413
    assert response.json()["detail"] == {"code": "request_too_large"}
    execute.assert_not_called()


def test_authentication_checked_before_csrf(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload(authenticated=False))
    csrf = generate_csrf_token()
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies={CSRF_COOKIE_NAME: csrf},
        headers=_csrf_headers(csrf),
    )
    assert response.status_code == 401


def test_fingerfood_api_token_works_only_for_machine_route(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "fingerfood_api_token", _TOKEN)
    response = client.post(_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 401
    response = client.post(
        _PREPARE_URL,
        json=_prepare_body(),
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert response.status_code != 401


def test_employee_cookie_cannot_replace_machine_bearer(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "fingerfood_api_token", _TOKEN)
    _enable_employee_mode(monkeypatch)
    response = client.post(
        _PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert response.status_code == 401


def test_machine_token_cannot_bypass_browser_employee_route(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "fingerfood_api_token", _TOKEN)
    _patch_introspection(monkeypatch, _introspection_payload(authenticated=False))
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert response.status_code == 401


def test_session_bootstrap_success(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.get(_UI_SESSION_URL, cookies=_session_cookies())
    assert response.status_code == 200
    payload = response.json()
    assert payload["authenticated"] is True
    assert payload["application_access_allowed"] is True
    assert payload["principal"]["username"] == "super.admin"
    assert isinstance(payload["csrf_token"], str)
    assert "effective_permissions" not in payload["principal"]
    assert CSRF_COOKIE_NAME in response.cookies
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["Vary"] == "Cookie"


def test_session_bootstrap_unauthenticated(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload(authenticated=False))
    response = employee_client.get(_UI_SESSION_URL, cookies=_session_cookies())
    assert response.status_code == 200
    assert response.json()["authenticated"] is False
    assert response.json()["csrf_token"] is None
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["Vary"] == "Cookie"


def test_session_bootstrap_unavailable_has_no_store_headers(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport({}, status=500),
    )
    monkeypatch.setattr(
        "app.core.employee_auth.build_introspection_client", lambda: client
    )
    response = employee_client.get(_UI_SESSION_URL, cookies=_session_cookies())
    assert response.status_code == 503
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["Vary"] == "Cookie"


def test_introspection_client_parses_duplicate_permissions() -> None:
    payload = _introspection_payload(
        permissions=["offers.prepare", "offers.prepare", "inquiries.view"]
    )
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport(payload),
    )
    result = client.introspect(_SESSION_TOKEN)
    assert result.principal is not None
    assert result.principal.effective_permissions == frozenset(
        {"offers.prepare", "inquiries.view"}
    )


def test_introspection_client_rejects_invalid_role() -> None:
    payload = _introspection_payload()
    principal = payload["principal"]
    assert isinstance(principal, dict)
    principal["role"] = "GUEST"
    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=_mock_introspection_transport(payload),
    )
    result = client.introspect(_SESSION_TOKEN)
    assert result.kind == "contract_failure"


@pytest.mark.parametrize(
    "raw_url",
    [
        f"http://user:pass@core.test{INTROSPECTION_PATH}",
        f"http://core.test{INTROSPECTION_PATH}?x=1",
        f"http://core.test{INTROSPECTION_PATH}#frag",
        "http://core.test/other",
    ],
)
def test_introspection_client_rejects_invalid_endpoint_urls(raw_url: str) -> None:
    with pytest.raises(RuntimeError):
        EmployeeIntrospectionClient(
            endpoint_url=raw_url, service_token=_INTROSPECT_TOKEN
        )


def test_credentials_not_logged_in_error_response(
    employee_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body(),
        cookies=_session_cookies(),
    )
    assert _SESSION_TOKEN not in response.text
    assert _INTROSPECT_TOKEN not in response.text
    assert _SESSION_TOKEN not in caplog.text
    assert _INTROSPECT_TOKEN not in caplog.text


def test_disabled_mode_prepare_unchanged(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "fingerfood_api_token", _TOKEN)
    core = MagicMock()
    core.is_configured.return_value = True
    core.get_inquiry.return_value = {"inquiry_id": _INQUIRY_ID}
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        lambda body: {"offer_id": _OFFER_ID},
    )
    response = client.post(_UI_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 200


def test_disabled_mode_malformed_json_returns_400(client: TestClient) -> None:
    response = client.post(
        _UI_PREPARE_URL,
        content="{not-json",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400


def test_disabled_mode_invalid_shape_returns_422(client: TestClient) -> None:
    response = client.post(_UI_PREPARE_URL, json={"inquiry_id": _INQUIRY_ID})
    assert response.status_code == 422


def test_introspection_client_follows_no_redirects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(302, headers={"location": "http://evil.test"})

    client = EmployeeIntrospectionClient(
        endpoint_url=_INTROSPECT_URL,
        service_token=_INTROSPECT_TOKEN,
        transport=httpx.MockTransport(handler),
    )
    result = client.introspect(_SESSION_TOKEN)
    assert result.kind == "unavailable"
    assert seen["url"] == _INTROSPECT_URL
