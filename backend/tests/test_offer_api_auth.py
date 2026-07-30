"""Regression tests for fingerfood commercial write endpoint auth."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.routes import offer as offer_routes

_TOKEN = "test-fingerfood-api-token"
_PREPARE_URL = "/api/offer/prepare"


def _prepare_body() -> dict[str, object]:
    return {
        "inquiry_id": "11111111-1111-4111-8111-111111111111",
        "snapshot_id": "22222222-2222-4222-8222-222222222222",
        "valid_until": "2026-07-30",
        "recipient": {
            "company_name": "Example GmbH",
            "contact_name": "Contact",
            "email": "a@example.invalid",
            "postal_address": "Street 1",
        },
        "event": {
            "event_date": "2026-08-20",
            "time_window_text": "18:00–22:00",
            "location_text": "Hamburg",
            "guest_count": 10,
            "planning_mode": "caterer_suggestion",
        },
        "customer_text": {"title": "Angebot", "introduction": "Intro", "notes": ""},
        "payment_terms": {"method": "RECHNUNG", "customer_visible_text": "Rechnung"},
        "offer": {
            "persons": 10,
            "lines": [
                {
                    "item_id": "broetchen-mix-1",
                    "quantity_mode": "total",
                    "quantity": 10,
                }
            ],
        },
    }


@pytest.fixture
def auth_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "fingerfood_api_token", _TOKEN)
    return TestClient(app)


def test_prepare_without_token_returns_401(auth_client: TestClient) -> None:
    response = auth_client.post(_PREPARE_URL, json=_prepare_body())
    assert response.status_code == 401
    assert response.json()["detail"] == "Unauthorized"


def test_prepare_wrong_token_returns_401(auth_client: TestClient) -> None:
    response = auth_client.post(
        _PREPARE_URL,
        json=_prepare_body(),
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Unauthorized"


def test_prepare_correct_token_happy_path(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    snapshot = {
        "schema_version": "offer_snapshot_v2",
        "snapshot_id": "22222222-2222-4222-8222-222222222222",
    }
    monkeypatch.setattr(
        offer_routes,
        "_build_snapshot_payload",
        lambda body: snapshot,
    )
    core = MagicMock()
    core.is_configured.return_value = True
    core.prepare_offer.return_value = {
        "offer_id": "33333333-3333-4333-8333-333333333333",
        "offer_version_id": "44444444-4444-4444-8444-444444444444",
        "snapshot_id": snapshot["snapshot_id"],
    }
    monkeypatch.setattr(offer_routes, "build_core_office_client", lambda: core)

    response = auth_client.post(
        _PREPARE_URL,
        json=_prepare_body(),
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["offer_id"] == "33333333-3333-4333-8333-333333333333"
    assert body["schema_version"] == "offer_snapshot_v2"
    core.prepare_offer.assert_called_once()


def test_snapshot_without_token_returns_401(auth_client: TestClient) -> None:
    response = auth_client.post("/api/offer/snapshot", json=_prepare_body())
    assert response.status_code == 401


def test_snapshot_validation_failure_returns_only_safe_fixed_detail(
    auth_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    private_marker = "customer@example.test snapshot Bearer private-token"
    monkeypatch.setattr(
        offer_routes,
        "_build_snapshot_payload",
        MagicMock(side_effect=ValueError(private_marker)),
    )

    response = auth_client.post(
        "/api/offer/snapshot",
        json=_prepare_body(),
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "code": "invalid_offer_snapshot",
            "message": "Offer snapshot is invalid.",
        }
    }
    assert private_marker not in response.text
    assert private_marker not in caplog.text


def test_health_stays_public(auth_client: TestClient) -> None:
    assert auth_client.get("/api/health").status_code == 200


def test_items_stays_public(auth_client: TestClient) -> None:
    assert auth_client.get("/api/items").status_code == 200


def test_prepare_without_configured_token_returns_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "fingerfood_api_token", None)
    client = TestClient(app)
    response = client.post(
        _PREPARE_URL,
        json=_prepare_body(),
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "FINGERFOOD_API_TOKEN not configured"
