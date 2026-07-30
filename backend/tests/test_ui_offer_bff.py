"""BFF tests — network-authenticated browser prepare (no browser token).

Inquiry existence check is workflow validation, not caller authorization.
See infra/systemd/BFF_ACCESS_BOUNDARY.md.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.routes import offer as offer_routes
from app.routes import ui_offer as ui_offer_routes
from app.services import core_office_client as core_client_module
from app.services.core_office_client import CoreOfficeClient
from tests.test_offer_api_auth import _PREPARE_URL, _prepare_body, _TOKEN

_UI_PREPARE_URL = "/api/ui/offer/prepare"
_INQUIRY_ID = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(
        settings,
        "core_office_panel_url",
        "https://office.example.test",
    )
    return TestClient(app)


def test_ui_prepare_does_not_require_browser_bearer_token(
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
        lambda body: {
            "offer_id": "33333333-3333-4333-8333-333333333333",
            "offer_version_id": "44444444-4444-4444-8444-444444444444",
            "snapshot_id": body.snapshot_id,
            "schema_version": "offer_snapshot_v2",
        },
    )

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 200
    assert response.json() == {
        "offer_id": "33333333-3333-4333-8333-333333333333",
        "redirect_url": (
            "https://office.example.test/offer/"
            "33333333-3333-4333-8333-333333333333"
        ),
    }
    assert "core-secret-token" not in response.text
    assert "snapshot_id" not in response.text
    core.get_inquiry.assert_called_once_with(_INQUIRY_ID)


def test_direct_prepare_still_requires_bearer_token(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "fingerfood_api_token", _TOKEN)
    response = client.post(_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 401


def test_ui_prepare_unknown_inquiry_returns_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    core = MagicMock()
    core.is_configured.return_value = True
    core.get_inquiry.return_value = None
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 404
    assert response.json()["detail"] == {
        "code": "inquiry_not_found",
        "message": "Inquiry was not found.",
    }


def test_ui_prepare_core_not_configured_returns_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    core = MagicMock()
    core.is_configured.return_value = False
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 503


def test_ui_prepare_panel_not_configured_returns_503(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "core_office_panel_url", None)

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "code": "core_office_panel_not_configured",
        "message": "Core Office Panel return URL is not configured.",
    }


def test_ui_prepare_unsafe_panel_configuration_fails_before_core_write(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        settings,
        "core_office_panel_url",
        "https://office.example.test?next=https://attacker.example",
    )
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())

    assert response.status_code == 503
    assert execute.call_count == 0


def test_ui_prepare_ignores_user_controlled_redirect(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    core = MagicMock()
    core.is_configured.return_value = True
    core.get_inquiry.return_value = {"inquiry_id": _INQUIRY_ID}
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        lambda body: {
            "offer_id": "33333333-3333-4333-8333-333333333333",
        },
    )
    body = _prepare_body()
    body["redirect_url"] = "https://attacker.example/steal"

    response = client.post(_UI_PREPARE_URL, json=body)

    assert response.status_code == 200
    assert response.json()["redirect_url"].startswith(
        "https://office.example.test/offer/"
    )
    assert "attacker.example" not in response.text


def test_ui_prepare_replay_returns_same_canonical_destination(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    core = MagicMock()
    core.is_configured.return_value = True
    core.get_inquiry.return_value = {"inquiry_id": _INQUIRY_ID}
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        lambda body: {
            "offer_id": "33333333-3333-4333-8333-333333333333",
            "existing_offer": True,
        },
    )

    first = client.post(_UI_PREPARE_URL, json=_prepare_body())
    replay = client.post(_UI_PREPARE_URL, json=_prepare_body())

    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json()
    assert first.json()["redirect_url"].endswith(
        "/offer/33333333-3333-4333-8333-333333333333"
    )


def test_redirect_handling_does_not_log_snapshot_or_customer_data(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    core = MagicMock()
    core.is_configured.return_value = True
    core.get_inquiry.return_value = {"inquiry_id": _INQUIRY_ID}
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)
    monkeypatch.setattr(
        ui_offer_routes,
        "execute_prepare_offer",
        lambda body: {
            "offer_id": "33333333-3333-4333-8333-333333333333",
        },
    )

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())

    assert response.status_code == 200
    assert "a@example.invalid" not in caplog.text
    assert "22222222-2222-4222-8222-222222222222" not in caplog.text


@pytest.mark.parametrize("status", [400, 500, 502])
def test_ui_prepare_lookup_failure_returns_only_stable_safe_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    status: int,
) -> None:
    private_markers = (
        "<html>private proxy diagnostics</html>",
        "snapshot-customer@example.test",
        "Bearer fake-lookup-credential",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status,
            text=" ".join(private_markers),
            request=request,
        )

    core = CoreOfficeClient(
        "https://core.example.test",
        "core-secret-token",
        transport=httpx.MockTransport(handler),
    )
    execute = MagicMock()
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)
    monkeypatch.setattr(ui_offer_routes, "execute_prepare_offer", execute)

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())

    assert response.status_code == 502
    assert response.json() == {
        "detail": {
            "code": "core_inquiry_lookup_failed",
            "message": "Core inquiry lookup failed.",
        }
    }
    for marker in private_markers:
        assert marker not in response.text
        assert marker not in caplog.text
    assert "core-secret-token" not in response.text
    assert "core-secret-token" not in caplog.text
    execute.assert_not_called()


def test_ui_prepare_write_failure_returns_only_stable_safe_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    private_markers = (
        "<html>private reverse-proxy failure</html>",
        "customer@example.test",
        "snapshot-private-payload",
        "Bearer fake-write-credential",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(
                200,
                json={"inquiry_id": _INQUIRY_ID},
                request=request,
            )
        return httpx.Response(
            500,
            text=" ".join(private_markers),
            request=request,
        )

    core = CoreOfficeClient(
        "https://core.example.test",
        "core-bff-private-token",
        transport=httpx.MockTransport(handler),
    )
    monkeypatch.setattr(
        ui_offer_routes,
        "build_core_office_client",
        lambda: core,
    )
    monkeypatch.setattr(
        offer_routes,
        "build_core_office_client",
        lambda: core,
    )
    monkeypatch.setattr(
        offer_routes,
        "_build_snapshot_payload",
        lambda body: {
            "schema_version": "offer_snapshot_v2",
            "snapshot_id": body.snapshot_id,
        },
    )

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())

    assert response.status_code == 502
    assert response.json() == {
        "detail": {
            "code": "core_offer_prepare_failed",
            "message": "Core offer preparation failed.",
        }
    }
    for marker in private_markers:
        assert marker not in response.text
        assert marker not in caplog.text
    assert "a@example.invalid" not in response.text
    assert "a@example.invalid" not in caplog.text
    assert "core-bff-private-token" not in response.text
    assert "core-bff-private-token" not in caplog.text


def test_ui_prepare_snapshot_failure_returns_only_stable_safe_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    private_marker = "snapshot customer@example.test secret-token diagnostics"
    lookup_core = MagicMock()
    lookup_core.is_configured.return_value = True
    lookup_core.get_inquiry.return_value = {"inquiry_id": _INQUIRY_ID}
    prepare_core = MagicMock()
    prepare_core.is_configured.return_value = True
    monkeypatch.setattr(
        ui_offer_routes,
        "build_core_office_client",
        lambda: lookup_core,
    )
    monkeypatch.setattr(
        offer_routes,
        "build_core_office_client",
        lambda: prepare_core,
    )
    monkeypatch.setattr(
        offer_routes,
        "_build_snapshot_payload",
        MagicMock(side_effect=ValueError(private_marker)),
    )

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())

    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "code": "invalid_offer_snapshot",
            "message": "Offer snapshot is invalid.",
        }
    }
    assert private_marker not in response.text
    assert private_marker not in caplog.text
    prepare_core.prepare_offer.assert_not_called()


def test_core_client_get_inquiry_sends_bearer_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, str]:
            return {"inquiry_id": _INQUIRY_ID}

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self) -> FakeClient:
            return self

        def __exit__(self, *args) -> None:
            return None

        def get(self, url: str, *, headers: dict[str, str]) -> FakeResponse:
            captured["url"] = url
            captured["headers"] = headers
            return FakeResponse()

    monkeypatch.setattr(core_client_module.httpx, "Client", FakeClient)
    client = core_client_module.CoreOfficeClient(
        "http://core.test", "core-secret-token"
    )
    result = client.get_inquiry(_INQUIRY_ID)
    assert result == {"inquiry_id": _INQUIRY_ID}
    headers = captured["headers"]
    assert isinstance(headers, dict)
    assert headers["Authorization"] == "Bearer core-secret-token"
