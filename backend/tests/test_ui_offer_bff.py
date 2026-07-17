"""BFF tests — network-authenticated browser prepare (no browser token).

Inquiry existence check is workflow validation, not caller authorization.
See infra/systemd/BFF_ACCESS_BOUNDARY.md.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.routes import ui_offer as ui_offer_routes
from app.services import core_office_client as core_client_module
from tests.test_offer_api_auth import _PREPARE_URL, _prepare_body, _TOKEN

_UI_PREPARE_URL = "/api/ui/offer/prepare"
_INQUIRY_ID = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def client() -> TestClient:
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
    assert response.json()["detail"] == "Inquiry not found"


def test_ui_prepare_core_not_configured_returns_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    core = MagicMock()
    core.is_configured.return_value = False
    monkeypatch.setattr(ui_offer_routes, "build_core_office_client", lambda: core)

    response = client.post(_UI_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 503


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
