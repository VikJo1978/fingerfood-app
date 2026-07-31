"""Route-level regression: guest-count consistency rejected with a safe 422.

Complements test_offer_snapshot_charges.py (which tests build_offer_snapshot_v2
directly) by proving the same rejection happens through the real HTTP
/api/offer/snapshot endpoint — routes/offer.py's generic
`except ValueError -> 422 {code, message}` wrapping, exercised end to end
with a real (mock-transport-backed) CatalogAdapter, not a stubbed
_build_snapshot_payload.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.classification import DietType
from app.models.item import Item
from app.routes import offer as offer_routes
from app.services.catalog_adapter import CatalogAdapter
from app.services.catalog_client import CatalogClient
from app.services.catalog_ids import dish_id_from_source_id

_TOKEN = "test-fingerfood-api-token"
_SOURCE_ID = "broetchen-mix-1"
_DISH_ID = dish_id_from_source_id(_SOURCE_ID)


def _item() -> Item:
    return Item(
        id=_SOURCE_ID,
        name="Pasta",
        section="Test",
        category="Test",
        price=9.0,
        price_type="piece",
        min_order=1,
        unit_label="Portion",
        description="Test",
        diet_type=DietType.omnivore,
        vat_rate_percent=7,
    )


def _mock_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if (
            request.url.path.endswith("/catalog/dishes")
            and "/dishes/" not in request.url.path
        ):
            return httpx.Response(
                200,
                json={
                    "dishes": [
                        {
                            "dish_id": _DISH_ID,
                            "name": "Pasta",
                            "current_unit_net_cents": 1200,
                            "price_display": "12.00 €",
                            "allergens": [],
                            "allergen_labels": [],
                            "active": True,
                        }
                    ],
                    "total_count": 1,
                    "truncated": False,
                },
            )
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def _body(*, persons: int, guest_count: int | None) -> dict[str, object]:
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
            "guest_count": guest_count,
            "planning_mode": "caterer_suggestion",
        },
        "customer_text": {"title": "Angebot", "introduction": "Intro", "notes": ""},
        "payment_terms": {"method": "RECHNUNG", "customer_visible_text": "Rechnung"},
        "offer": {
            "persons": persons,
            "lines": [
                {
                    "item_id": _SOURCE_ID,
                    "quantity_mode": "total",
                    "quantity": 10,
                }
            ],
        },
    }


@pytest.fixture
def auth_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    monkeypatch.setattr(settings, "fingerfood_api_token", _TOKEN)
    items_path = tmp_path / "items.json"
    items_path.write_text(
        json.dumps([_item().model_dump(mode="json")]), encoding="utf-8"
    )
    catalog_client = CatalogClient(
        "http://catalog.test", "token", transport=_mock_transport()
    )
    adapter = CatalogAdapter(catalog_client, items_path=items_path)
    monkeypatch.setattr(offer_routes, "build_catalog_adapter", lambda: adapter)
    return TestClient(app)


def test_snapshot_route_accepts_matching_persons_and_guest_count(
    auth_client: TestClient,
) -> None:
    response = auth_client.post(
        "/api/offer/snapshot",
        json=_body(persons=10, guest_count=10),
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert response.status_code == 200
    assert response.json()["event"]["guest_count"] == 10


def test_snapshot_route_rejects_mismatched_persons_and_guest_count(
    auth_client: TestClient,
) -> None:
    response = auth_client.post(
        "/api/offer/snapshot",
        json=_body(persons=10, guest_count=9),
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "code": "invalid_offer_snapshot",
            "message": "Offer snapshot is invalid.",
        }
    }
