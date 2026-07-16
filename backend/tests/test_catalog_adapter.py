"""Catalog adapter — Core API selection with items.json fallback."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import httpx
import pytest

from app.models.classification import DietType
from app.models.item import Item
from app.models.offer import OfferLineIn, OfferRequest
from app.services.catalog_adapter import CatalogAdapter
from app.services.catalog_client import CatalogClient
from app.services.catalog_ids import dish_id_from_source_id
from app.services.offer_snapshot_service import build_offer_snapshot_v2

_SOURCE_ID = "broetchen-mix-1"
_DISH_ID = dish_id_from_source_id(_SOURCE_ID)
_INACTIVE_ID = "inactive-dish"
_INACTIVE_DISH_ID = dish_id_from_source_id(_INACTIVE_ID)


def _item(
    *,
    item_id: str = _SOURCE_ID,
    price: float = 9.0,
    name: str = "Brötchen Mix 1",
) -> Item:
    return Item(
        id=item_id,
        name=name,
        section="Test",
        category="Brötchen",
        price=price,
        price_type="piece",
        min_order=1,
        unit_label="Stück",
        description="Test description",
        items_included="Composition text",
        diet_type=DietType.omnivore,
        vat_rate_percent=7,
    )


def _write_items(path: Path, items: list[Item]) -> None:
    path.write_text(
        json.dumps([item.model_dump(mode="json") for item in items]),
        encoding="utf-8",
    )


def _catalog_list_response(*dishes: dict[str, object]) -> dict[str, object]:
    return {"dishes": list(dishes), "total_count": len(dishes), "truncated": False}


def _dish_payload(
    *,
    dish_id: str,
    name: str,
    cents: int,
    active: bool = True,
    allergens: list[str] | None = None,
) -> dict[str, object]:
    return {
        "dish_id": dish_id,
        "name": name,
        "current_unit_net_cents": cents,
        "price_display": f"{cents / 100:.2f} €",
        "allergens": allergens or ["A", "G"],
        "allergen_labels": ["Gluten", "Milch"],
        "active": active,
    }


def _detail_payload(dish: dict[str, object]) -> dict[str, object]:
    return {
        **dish,
        "description": "Catalog description",
        "composition": "Catalog composition",
        "notes": None,
        "created_at": "2026-07-16T08:00:00+00:00",
        "updated_at": "2026-07-16T08:00:00+00:00",
    }


def _mock_transport(
    *,
    list_status: int = 200,
    list_body: dict[str, object] | None = None,
    detail_by_id: dict[str, dict[str, object]] | None = None,
) -> httpx.MockTransport:
    detail_by_id = detail_by_id or {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/catalog/dishes") and "dishes/" not in request.url.path:
            if list_status >= 400:
                return httpx.Response(list_status, json={"error": "unavailable"})
            return httpx.Response(200, json=list_body or _catalog_list_response())
        if "/catalog/dishes/" in request.url.path:
            dish_id = request.url.path.rsplit("/", 1)[-1]
            body = detail_by_id.get(dish_id)
            if body is None:
                return httpx.Response(404, json={"error": "not_found"})
            return httpx.Response(200, json=body)
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def _adapter(
    tmp_path: Path,
    *,
    transport: httpx.BaseTransport | None = None,
    items: list[Item] | None = None,
) -> CatalogAdapter:
    items_path = tmp_path / "items.json"
    _write_items(items_path, items or [_item()])
    client = CatalogClient("http://core.test", "token", transport=transport)
    return CatalogAdapter(client, items_path=items_path)


def test_catalog_api_maps_to_compose_items_with_catalog_price(tmp_path: Path) -> None:
    dish = _dish_payload(dish_id=_DISH_ID, name="Brötchen Mix 1", cents=1000)
    transport = _mock_transport(
        list_body=_catalog_list_response(dish),
        detail_by_id={_DISH_ID: _detail_payload(dish)},
    )
    adapter = _adapter(tmp_path, transport=transport, items=[_item(price=9.0)])

    loaded = adapter.load_items_for_compose()

    assert loaded.source == "catalog"
    assert loaded.items[_SOURCE_ID].price == 10.0


def test_catalog_unavailable_falls_back_to_items_json(tmp_path: Path) -> None:
    transport = _mock_transport(list_status=503)
    adapter = _adapter(tmp_path, transport=transport, items=[_item(price=9.0)])

    loaded = adapter.load_items_for_compose()

    assert loaded.source == "items_json"
    assert loaded.items[_SOURCE_ID].price == 9.0
    assert loaded.warnings


def test_inactive_catalog_dish_not_in_compose_list(tmp_path: Path) -> None:
    active = _dish_payload(dish_id=_DISH_ID, name="Active", cents=900)
    transport = _mock_transport(list_body=_catalog_list_response(active))
    adapter = _adapter(
        tmp_path,
        transport=transport,
        items=[_item(), _item(item_id=_INACTIVE_ID, name="Inactive", price=5.0)],
    )

    loaded = adapter.load_items_for_compose()

    assert _SOURCE_ID in loaded.items
    assert _INACTIVE_ID not in loaded.items


def test_resolve_line_builds_v2_snapshot_position_from_catalog(tmp_path: Path) -> None:
    dish = _dish_payload(dish_id=_DISH_ID, name="Brötchen Mix 1", cents=1000, allergens=["G"])
    transport = _mock_transport(
        list_body=_catalog_list_response(dish),
        detail_by_id={_DISH_ID: _detail_payload(dish)},
    )
    adapter = _adapter(tmp_path, transport=transport, items=[_item(price=9.0)])
    offer = OfferRequest(
        persons=10,
        lines=[
            OfferLineIn(
                item_id=_SOURCE_ID,
                quantity_mode="total",
                quantity=10,
            )
        ],
    )

    snapshot = build_offer_snapshot_v2(
        adapter=adapter,
        inquiry_id="22222222-2222-4222-8222-222222222222",
        snapshot_id="77777777-7777-4777-8777-777777777771",
        valid_until=date(2026, 7, 30),
        recipient={
            "company_name": "Example",
            "contact_name": "Contact",
            "email": "a@example.invalid",
            "postal_address": "Address",
        },
        event={
            "event_date": "2026-08-20",
            "time_window_text": "18:00–22:00",
            "location_text": "Hamburg",
            "guest_count": 10,
            "planning_mode": "caterer_suggestion",
        },
        customer_text={
            "title": "Sommerfest",
            "introduction": "Intro",
            "notes": "Notes",
        },
        payment_terms={
            "method": "RECHNUNG",
            "customer_visible_text": "Rechnung",
        },
        offer=offer,
    )

    position = snapshot["variants"][0]["positions"][0]  # type: ignore[index]
    assert snapshot["schema_version"] == "offer_snapshot_v2"
    assert position["catalog_item_id"] == _DISH_ID
    assert position["unit_net_cents"] == 1000
    assert position["allergens"] == ["G"]
    assert position["net_total_cents"] == 10000


def test_fallback_snapshot_uses_items_json_price(tmp_path: Path) -> None:
    transport = _mock_transport(list_status=503)
    adapter = _adapter(tmp_path, transport=transport, items=[_item(price=9.0)])
    offer = OfferRequest(
        persons=10,
        lines=[OfferLineIn(item_id=_SOURCE_ID, quantity_mode="total", quantity=1)],
    )

    snapshot = build_offer_snapshot_v2(
        adapter=adapter,
        inquiry_id="22222222-2222-4222-8222-222222222222",
        snapshot_id="77777777-7777-4777-8777-777777777771",
        valid_until=date(2026, 7, 30),
        recipient={
            "company_name": "Example",
            "contact_name": "Contact",
            "email": "a@example.invalid",
            "postal_address": "Address",
        },
        event={
            "event_date": "2026-08-20",
            "time_window_text": "18:00–22:00",
            "location_text": "Hamburg",
            "guest_count": 10,
            "planning_mode": "caterer_suggestion",
        },
        customer_text={"title": "T", "introduction": "I", "notes": "N"},
        payment_terms={"method": "RECHNUNG", "customer_visible_text": "R"},
        offer=offer,
    )

    position = snapshot["variants"][0]["positions"][0]  # type: ignore[index]
    assert position["unit_net_cents"] == 900


def test_strict_mode_raises_when_catalog_unavailable(tmp_path: Path) -> None:
    transport = _mock_transport(list_status=503)
    adapter = _adapter(tmp_path, transport=transport, items=[_item()])
    adapter._strict = True  # noqa: SLF001

    with pytest.raises(Exception, match="catalog"):
        adapter.load_items_for_compose()
