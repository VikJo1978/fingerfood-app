"""Unit tests — CONFIGURABLE_OFFER_CHARGES_V1 position materialization.

Exercises ``build_offer_snapshot_v2`` directly (no real Core server — see
``test_prepare_offer_e2e.py`` for the cross-repository contract tests
against the real Core PR #62 validator). Focused on: legacy compatibility
path, explicit charges_definition path for all base_mode combinations,
guest-count handling, and malformed-payload rejection.
"""

from __future__ import annotations

import json
import uuid
from datetime import date
from pathlib import Path
from typing import cast

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
_GUEST_COUNT = 80


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


def _write_items(path: Path) -> None:
    path.write_text(json.dumps([_item().model_dump(mode="json")]), encoding="utf-8")


def _catalog_list_response() -> dict[str, object]:
    return {
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
    }


def _catalog_detail_response() -> dict[str, object]:
    dish = _catalog_list_response()["dishes"][0]
    assert isinstance(dish, dict)
    return {
        **dish,
        "description": "Catalog description",
        "composition": "Catalog composition",
        "notes": None,
        "created_at": "2026-07-16T08:00:00+00:00",
        "updated_at": "2026-07-16T08:00:00+00:00",
    }


def _mock_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if (
            request.url.path.endswith("/catalog/dishes")
            and "/dishes/" not in request.url.path
        ):
            return httpx.Response(200, json=_catalog_list_response())
        if "/catalog/dishes/" in request.url.path:
            return httpx.Response(200, json=_catalog_detail_response())
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def _adapter(tmp_path: Path) -> CatalogAdapter:
    items_path = tmp_path / "items.json"
    _write_items(items_path)
    catalog_client = CatalogClient(
        "http://catalog.test", "token", transport=_mock_transport()
    )
    return CatalogAdapter(catalog_client, items_path=items_path)


def _offer() -> OfferRequest:
    return OfferRequest(
        persons=_GUEST_COUNT,
        lines=[
            OfferLineIn(
                item_id=_SOURCE_ID,
                quantity_mode="total",
                quantity=10,
                surcharge_selected=False,
            )
        ],
    )


def _build(
    tmp_path: Path,
    *,
    charges_definition: dict[str, object] | None,
    guest_count: int | None = _GUEST_COUNT,
) -> dict[str, object]:
    return build_offer_snapshot_v2(
        adapter=_adapter(tmp_path),
        inquiry_id=str(uuid.uuid4()),
        snapshot_id=str(uuid.uuid4()),
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
            "guest_count": guest_count,
            "planning_mode": "caterer_suggestion",
        },
        customer_text={"title": "Pasta", "introduction": "Intro", "notes": ""},
        payment_terms={"method": "RECHNUNG", "customer_visible_text": "Rechnung"},
        offer=_offer(),
        charges_definition=charges_definition,
    )


def _positions(snapshot: dict[str, object]) -> list[dict[str, object]]:
    variants = cast(list[dict[str, object]], snapshot["variants"])
    return cast(list[dict[str, object]], variants[0]["positions"])


def _charges(
    *,
    delivery_amount_cents: int = 3500,
    dishware_base_mode: str = "NONE",
    dishware_per_person_cents: int = 200,
    dishware_lines: list[dict[str, object]] | None = None,
    buffet_base_mode: str = "NONE",
    buffet_per_person_cents: int = 50,
) -> dict[str, object]:
    return {
        "delivery": {"amount_cents": delivery_amount_cents},
        "dishware": {
            "base_mode": dishware_base_mode,
            "pauschale_per_person_cents": dishware_per_person_cents,
            "additional_lines": dishware_lines or [],
        },
        "buffet": {
            "base_mode": buffet_base_mode,
            "pauschale_per_person_cents": buffet_per_person_cents,
        },
    }


# --- legacy compatibility path (charges_definition omitted) ------------------------


def test_omitted_charges_definition_keeps_legacy_fee_positions(tmp_path: Path) -> None:
    snapshot = _build(tmp_path, charges_definition=None)
    assert "charges_definition" not in snapshot
    positions = _positions(snapshot)
    fee_positions = [p for p in positions if p["kind"] == "fee"]
    assert {p["name"] for p in fee_positions} == {
        "Büffetpauschale",
        "Geschirrpauschale",
        "Anlieferung",
    }
    assert not any(
        p["kind"] in {"delivery", "dishware", "buffet_fee"} for p in positions
    )


# --- explicit path: delivery ---------------------------------------------------------


def test_delivery_always_materialized_including_zero(tmp_path: Path) -> None:
    snapshot = _build(tmp_path, charges_definition=_charges(delivery_amount_cents=0))
    positions = _positions(snapshot)
    delivery = [p for p in positions if p["kind"] == "delivery"]
    assert len(delivery) == 1
    assert delivery[0]["net_total_cents"] == 0
    assert delivery[0]["name"] == "Anlieferung"


def test_delivery_nonzero_amount(tmp_path: Path) -> None:
    snapshot = _build(tmp_path, charges_definition=_charges(delivery_amount_cents=3500))
    delivery = [p for p in _positions(snapshot) if p["kind"] == "delivery"]
    assert len(delivery) == 1
    assert delivery[0]["net_total_cents"] == 3500
    assert delivery[0]["unit_net_cents"] == 3500
    assert delivery[0]["quantity_mode"] == "total"
    assert delivery[0]["quantity"] == "1"


# --- explicit path: dishware/buffet NONE excludes materialization ------------------


def test_both_none_materializes_only_delivery(tmp_path: Path) -> None:
    snapshot = _build(tmp_path, charges_definition=_charges())
    positions = _positions(snapshot)
    kinds = [p["kind"] for p in positions]
    assert kinds.count("delivery") == 1
    assert "dishware" not in kinds
    assert "buffet_fee" not in kinds
    assert "charges_definition" in snapshot


# --- explicit path: buffet PAUSCHALE --------------------------------------------------


def test_buffet_pauschale_materializes_buffet_fee_position(tmp_path: Path) -> None:
    snapshot = _build(
        tmp_path, charges_definition=_charges(buffet_base_mode="PAUSCHALE")
    )
    positions = _positions(snapshot)
    buffet = [p for p in positions if p["kind"] == "buffet_fee"]
    assert len(buffet) == 1
    assert buffet[0]["name"] == "Büffetpauschale"
    assert buffet[0]["quantity_mode"] == "per_person"
    assert buffet[0]["quantity"] == "1"
    assert buffet[0]["unit_net_cents"] == 50
    assert buffet[0]["net_total_cents"] == 50 * _GUEST_COUNT


# --- explicit path: dishware PAUSCHALE ------------------------------------------------


def test_dishware_pauschale_materializes_dishware_position(tmp_path: Path) -> None:
    snapshot = _build(
        tmp_path, charges_definition=_charges(dishware_base_mode="PAUSCHALE")
    )
    positions = _positions(snapshot)
    dishware = [p for p in positions if p["kind"] == "dishware"]
    assert len(dishware) == 1
    assert dishware[0]["name"] == "Geschirrpauschale"
    assert dishware[0]["quantity_mode"] == "per_person"
    assert dishware[0]["quantity"] == "1"
    assert dishware[0]["unit_net_cents"] == 200
    assert dishware[0]["net_total_cents"] == 200 * _GUEST_COUNT


def test_dishware_none_with_lines_only(tmp_path: Path) -> None:
    snapshot = _build(
        tmp_path,
        charges_definition=_charges(
            dishware_base_mode="NONE",
            dishware_lines=[
                {"description": "Weinglas", "quantity": 20, "unit_net_cents": 80}
            ],
        ),
    )
    positions = _positions(snapshot)
    dishware = [p for p in positions if p["kind"] == "dishware"]
    assert len(dishware) == 1
    assert dishware[0]["name"] == "Weinglas"
    assert dishware[0]["quantity_mode"] == "total"
    assert dishware[0]["quantity"] == "20"
    assert dishware[0]["unit_net_cents"] == 80
    assert dishware[0]["net_total_cents"] == 1600


def test_dishware_pauschale_plus_lines(tmp_path: Path) -> None:
    snapshot = _build(
        tmp_path,
        charges_definition=_charges(
            dishware_base_mode="PAUSCHALE",
            dishware_lines=[
                {"description": "Weinglas", "quantity": 20, "unit_net_cents": 80}
            ],
        ),
    )
    positions = _positions(snapshot)
    dishware = [p for p in positions if p["kind"] == "dishware"]
    assert len(dishware) == 2
    names = {p["name"] for p in dishware}
    assert names == {"Geschirrpauschale", "Weinglas"}


def test_dishware_line_net_total_is_server_derived_not_client_trusted(
    tmp_path: Path,
) -> None:
    """No net_total_cents field exists on the request model at all — this
    proves the materialized value is always quantity * unit_net_cents."""
    snapshot = _build(
        tmp_path,
        charges_definition=_charges(
            dishware_lines=[
                {"description": "Teller", "quantity": 7, "unit_net_cents": 33}
            ]
        ),
    )
    dishware = [p for p in _positions(snapshot) if p["kind"] == "dishware"]
    assert dishware[0]["net_total_cents"] == 7 * 33


# --- guest_count handling --------------------------------------------------------------


def test_dishware_pauschale_without_guest_count_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="requires event.guest_count"):
        _build(
            tmp_path,
            charges_definition=_charges(dishware_base_mode="PAUSCHALE"),
            guest_count=None,
        )


def test_buffet_pauschale_without_guest_count_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="requires event.guest_count"):
        _build(
            tmp_path,
            charges_definition=_charges(buffet_base_mode="PAUSCHALE"),
            guest_count=None,
        )


def test_both_none_does_not_require_guest_count(tmp_path: Path) -> None:
    snapshot = _build(tmp_path, charges_definition=_charges(), guest_count=None)
    assert "charges_definition" in snapshot


# --- malformed payload rejection ----------------------------------------------------


def test_malformed_charges_definition_raises_value_error(tmp_path: Path) -> None:
    bad = _charges()
    bad["extra"] = 1
    with pytest.raises(ValueError, match="invalid charges_definition"):
        _build(tmp_path, charges_definition=bad)


def test_charges_definition_bool_amount_rejected(tmp_path: Path) -> None:
    bad = _charges()
    bad["delivery"] = {"amount_cents": True}
    with pytest.raises(ValueError, match="invalid charges_definition"):
        _build(tmp_path, charges_definition=bad)


# --- totals ------------------------------------------------------------------------


def test_totals_include_all_charge_positions(tmp_path: Path) -> None:
    snapshot = _build(
        tmp_path,
        charges_definition=_charges(
            dishware_base_mode="PAUSCHALE",
            dishware_lines=[
                {"description": "Weinglas", "quantity": 20, "unit_net_cents": 80}
            ],
            buffet_base_mode="PAUSCHALE",
        ),
    )
    positions = _positions(snapshot)
    variants = cast(list[dict[str, object]], snapshot["variants"])
    totals = cast(dict[str, object], variants[0]["totals"])
    expected_net = sum(cast(int, p["net_total_cents"]) for p in positions)
    expected_gross = sum(cast(int, p["gross_total_cents"]) for p in positions)
    assert totals["net_cents"] == expected_net
    assert totals["gross_cents"] == expected_gross
