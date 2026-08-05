from __future__ import annotations

import threading
from datetime import UTC, datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.csrf import CSRF_COOKIE_NAME, generate_csrf_token
from app.main import app
from app.routes import ui_handoff as ui_handoff_routes
from app.routes import ui_offer as ui_offer_routes
from app.services.configurator_handoff_context import ConfiguratorPrepareContextStore
from app.services.core_configurator_handoff_client import (
    CoreConfiguratorHandoffError,
    ExchangedCoreHandoff,
)
from tests.test_employee_auth_bff import (
    _INTROSPECT_TOKEN,
    _INTROSPECT_URL,
    _csrf_headers,
    _introspection_payload,
    _patch_introspection,
    _session_cookies,
)
from tests.test_offer_api_auth import _prepare_body

_UI_HANDOFF_EXCHANGE_URL = "/api/ui/handoff/exchange"
_UI_PREPARE_URL = "/api/ui/offer/prepare"
_ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
_OTHER_ACCOUNT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
_INQUIRY_ID = "11111111-1111-4111-8111-111111111111"
_CONTEXT_ID = "trusted-context-1"
_OFFER_ID = "33333333-3333-4333-8333-333333333333"


def _trusted_transfer() -> dict[str, object]:
    return {
        "planning": {
            "persons": 30,
            "budget": None,
            "budgetEnabled": False,
            "desiredModules": [],
            "dietaryRequirements": "",
            "eventType": "",
            "serviceStyle": "",
        },
        "orderContextPrefill": {
            "companyName": "Musterfirma GmbH",
            "contactPerson": "Erika Musterfrau",
            "email": "erika@example.invalid",
            "phone": "+49301234567",
            "eventDate": "2026-07-31",
            "eventTime": "12:25",
            "location": "Musterstraße 1, 22549 Hamburg",
            "billingAddress": "",
            "remarks": "Betreff: Hochzeit",
        },
    }


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
        tmp_path / "handoff-context.sqlite3",
    )
    return TestClient(app)


def _context_store() -> ConfiguratorPrepareContextStore:
    return ConfiguratorPrepareContextStore(settings.configurator_handoff_context_db)


def _authenticated_headers(csrf: str) -> dict[str, str]:
    return _csrf_headers(csrf)


def _authenticated_cookies(csrf: str) -> dict[str, str]:
    return {**_session_cookies(), CSRF_COOKIE_NAME: csrf}


def test_valid_exchange_creates_context(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    csrf = generate_csrf_token()

    class FakeCoreHandoffClient:
        def is_configured(self) -> bool:
            return True

        def exchange(
            self, *, code: str, employee_session_token: str
        ) -> ExchangedCoreHandoff:
            assert code == "opaque-code"
            assert employee_session_token
            return ExchangedCoreHandoff(
                handoff_id="handoff-1",
                operation="prepare_first_offer",
                inquiry_id=_INQUIRY_ID,
                transfer=_trusted_transfer(),
                expires_at="2026-08-04T10:15:00+00:00",
            )

    monkeypatch.setattr(
        ui_handoff_routes,
        "build_core_configurator_handoff_client",
        lambda: FakeCoreHandoffClient(),
    )

    response = employee_client.post(
        _UI_HANDOFF_EXCHANGE_URL,
        json={"code": "opaque-code"},
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["operation"] == "prepare_first_offer"
    assert payload["transfer"] == _trusted_transfer()
    context = _context_store().get(payload["context_id"])
    assert context is not None
    assert context.account_id == _ACCOUNT_ID
    assert context.inquiry_id == _INQUIRY_ID
    assert context.operation == "prepare_first_offer"
    assert context.trusted_transfer == _trusted_transfer()


@pytest.mark.parametrize(
    ("status_code", "expected_code"),
    [(404, "handoff_not_found"), (410, "handoff_gone")],
)
def test_invalid_or_replayed_core_code_rejected(
    employee_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    expected_code: str,
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    csrf = generate_csrf_token()

    class FakeCoreHandoffClient:
        def is_configured(self) -> bool:
            return True

        def exchange(
            self, *, code: str, employee_session_token: str
        ) -> ExchangedCoreHandoff:
            raise CoreConfiguratorHandoffError(
                code=f"handoff_http_{status_code}",
                status_code=status_code,
            )

    monkeypatch.setattr(
        ui_handoff_routes,
        "build_core_configurator_handoff_client",
        lambda: FakeCoreHandoffClient(),
    )

    response = employee_client.post(
        _UI_HANDOFF_EXCHANGE_URL,
        json={"code": "opaque-code"},
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert response.status_code == status_code
    assert response.json()["detail"] == {"code": expected_code}


def test_different_employee_cannot_use_context(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _introspection_payload()
    principal = payload["principal"]
    assert isinstance(principal, dict)
    principal["account_id"] = _OTHER_ACCOUNT_ID
    _patch_introspection(monkeypatch, payload)
    csrf = generate_csrf_token()
    _context_store().create(
        account_id=_ACCOUNT_ID,
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer=_trusted_transfer(),
    )
    body = _prepare_body() | {"context_id": _CONTEXT_ID}
    body["context_id"] = (
        _context_store()
        .create(
            account_id=_ACCOUNT_ID,
            operation="prepare_first_offer",
            inquiry_id=_INQUIRY_ID,
            trusted_transfer=_trusted_transfer(),
        )
        .context_id
    )

    response = employee_client.post(
        _UI_PREPARE_URL,
        json=body,
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "prepare_context_forbidden"


def test_expired_context_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    csrf = generate_csrf_token()
    context = _context_store().create(
        account_id=_ACCOUNT_ID,
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer=_trusted_transfer(),
        now=datetime.now(UTC) - timedelta(minutes=11),
    )
    body = _prepare_body() | {"context_id": context.context_id}

    response = employee_client.post(
        _UI_PREPARE_URL,
        json=body,
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert response.status_code == 410
    assert response.json()["detail"]["code"] == "prepare_context_expired"


def test_browser_inquiry_id_substitution_is_ignored(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    csrf = generate_csrf_token()
    context = _context_store().create(
        account_id=_ACCOUNT_ID,
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer=_trusted_transfer(),
    )
    execute = MagicMock(return_value={"offer_id": _OFFER_ID})
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)

    body = _prepare_body() | {
        "context_id": context.context_id,
        "inquiry_id": "99999999-9999-4999-8999-999999999999",
        "recipient": {
            "company_name": "Attacker GmbH",
            "contact_name": "Mallory",
            "email": "mallory@example.invalid",
            "postal_address": "Bad Street 1",
        },
    }

    response = employee_client.post(
        _UI_PREPARE_URL,
        json=body,
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert response.status_code == 200
    prepared_body = execute.call_args.args[0]
    assert prepared_body.inquiry_id == _INQUIRY_ID
    assert prepared_body.recipient["company_name"] == "Musterfirma GmbH"
    assert prepared_body.recipient["contact_name"] == "Erika Musterfrau"
    assert prepared_body.recipient["email"] == "erika@example.invalid"


def test_denied_prepare_causes_zero_core_prepare_calls(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _introspection_payload(permissions=["inquiries.view"])
    principal = payload["principal"]
    assert isinstance(principal, dict)
    principal["role"] = "USER"
    _patch_introspection(monkeypatch, payload)
    csrf = generate_csrf_token()
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)
    context = _context_store().create(
        account_id=_ACCOUNT_ID,
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer=_trusted_transfer(),
    )

    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body() | {"context_id": context.context_id},
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert response.status_code == 403
    execute.assert_not_called()
    assert _context_store().get(context.context_id) is not None
    assert _context_store().get(context.context_id).consumed_at is None


def test_successful_prepare_consumes_context(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    csrf = generate_csrf_token()
    context = _context_store().create(
        account_id=_ACCOUNT_ID,
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer=_trusted_transfer(),
    )
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        MagicMock(return_value={"offer_id": _OFFER_ID}),
    )

    response = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body() | {"context_id": context.context_id},
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert response.status_code == 200
    refreshed = _context_store().get(context.context_id)
    assert refreshed is not None
    assert refreshed.consumed_at is not None
    assert refreshed.claim_id is None
    assert refreshed.claimed_at is None


def test_core_prepare_failure_releases_claim_for_retry(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    csrf = generate_csrf_token()
    context = _context_store().create(
        account_id=_ACCOUNT_ID,
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer=_trusted_transfer(),
    )
    execute = MagicMock(
        side_effect=[
            Exception("transient failure"),
            {"offer_id": _OFFER_ID},
        ]
    )
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)

    with pytest.raises(Exception, match="transient failure"):
        employee_client.post(
            _UI_PREPARE_URL,
            json=_prepare_body() | {"context_id": context.context_id},
            cookies=_authenticated_cookies(csrf),
            headers=_authenticated_headers(csrf),
        )
    second = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body() | {"context_id": context.context_id},
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert second.status_code == 200
    refreshed = _context_store().get(context.context_id)
    assert refreshed is not None
    assert refreshed.consumed_at is not None


def test_concurrent_double_submit_reaches_core_once_even_after_old_claim_timestamp(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    csrf = generate_csrf_token()
    context = _context_store().create(
        account_id=_ACCOUNT_ID,
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer=_trusted_transfer(),
    )
    entered = threading.Event()
    release = threading.Event()
    reached_core = 0
    reached_core_lock = threading.Lock()

    def execute(_body: object) -> dict[str, object]:
        nonlocal reached_core
        with reached_core_lock:
            reached_core += 1
        entered.set()
        release.wait(timeout=5)
        return {"offer_id": _OFFER_ID}

    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)

    def submit() -> int:
        response = employee_client.post(
            _UI_PREPARE_URL,
            json=_prepare_body() | {"context_id": context.context_id},
            cookies=_authenticated_cookies(csrf),
            headers=_authenticated_headers(csrf),
        )
        return response.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(submit)
        assert entered.wait(timeout=5)
        with _context_store()._connect() as connection:
            connection.execute(
                """
                UPDATE configurator_prepare_contexts
                SET claimed_at = ?
                WHERE context_id = ?
                """,
                (
                    (datetime.now(UTC) - timedelta(seconds=120)).isoformat(),
                    context.context_id,
                ),
            )
            connection.commit()
        second = pool.submit(submit)
        second_status = second.result(timeout=5)
        release.set()
        first_status = first.result(timeout=5)

    assert sorted([first_status, second_status]) == [200, 409]
    assert reached_core == 1


def test_replayed_context_rejected(
    employee_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_introspection(monkeypatch, _introspection_payload())
    csrf = generate_csrf_token()
    context = _context_store().create(
        account_id=_ACCOUNT_ID,
        operation="prepare_first_offer",
        inquiry_id=_INQUIRY_ID,
        trusted_transfer=_trusted_transfer(),
    )
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        MagicMock(return_value={"offer_id": _OFFER_ID}),
    )

    first = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body() | {"context_id": context.context_id},
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )
    replay = employee_client.post(
        _UI_PREPARE_URL,
        json=_prepare_body() | {"context_id": context.context_id},
        cookies=_authenticated_cookies(csrf),
        headers=_authenticated_headers(csrf),
    )

    assert first.status_code == 200
    assert replay.status_code == 410
    assert replay.json()["detail"]["code"] == "prepare_context_consumed"
