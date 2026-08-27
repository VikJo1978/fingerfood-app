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


def _offer(*, persons: int = _GUEST_COUNT) -> OfferRequest:
    return OfferRequest(
        persons=persons,
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
    persons: int = _GUEST_COUNT,
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
        offer=_offer(persons=persons),
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


def test_unknown_catalog_position_is_rejected_instead_of_silently_dropped(
    tmp_path: Path,
) -> None:
    bad_offer = OfferRequest(
        persons=_GUEST_COUNT,
        lines=[
            OfferLineIn(
                item_id="legacy-missing-id",
                quantity_mode="total",
                quantity=10,
                surcharge_selected=False,
            )
        ],
    )
    with pytest.raises(ValueError, match="unknown catalog positions: legacy-missing-id"):
        build_offer_snapshot_v2(
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
                "guest_count": _GUEST_COUNT,
                "planning_mode": "caterer_suggestion",
            },
            customer_text={"title": "Pasta", "introduction": "Intro", "notes": ""},
            payment_terms={"method": "RECHNUNG", "customer_visible_text": "Rechnung"},
            offer=bad_offer,
            charges_definition=_charges(),
        )


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


# --- guest-count consistency (offer.persons vs. event.guest_count) -----------------
#
# The request carries two independently client-supplied "guest count"
# fields. Before this rule existed, catalog/surcharge/legacy-Pauschale
# pricing used offer.persons while the new charges_definition Pauschale
# math used event.guest_count — two calculation sources that could
# silently diverge. build_offer_snapshot_v2 now requires them equal
# whenever both are present, checked once before any pricing happens.


def test_equal_offer_persons_and_event_guest_count_accepted(tmp_path: Path) -> None:
    snapshot = _build(
        tmp_path,
        charges_definition=_charges(buffet_base_mode="PAUSCHALE"),
        persons=80,
        guest_count=80,
    )
    assert snapshot["event"]["guest_count"] == 80  # type: ignore[index]


def test_equal_values_accepted_on_legacy_path_without_charges_definition(
    tmp_path: Path,
) -> None:
    snapshot = _build(tmp_path, charges_definition=None, persons=80, guest_count=80)
    assert "charges_definition" not in snapshot


def test_omitted_event_guest_count_is_not_a_mismatch(tmp_path: Path) -> None:
    """No comparison is possible (and none is made) when event.guest_count
    is absent — offer.persons remains the sole guest count, exactly as
    before this rule existed."""
    snapshot = _build(
        tmp_path,
        charges_definition=_charges(dishware_base_mode="NONE", buffet_base_mode="NONE"),
        persons=80,
        guest_count=None,
    )
    assert snapshot["event"]["guest_count"] is None  # type: ignore[index]


def test_mismatched_values_rejected_before_pricing(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="guest count mismatch"):
        _build(
            tmp_path,
            charges_definition=_charges(),
            persons=80,
            guest_count=79,
        )


def test_mismatched_values_rejected_on_legacy_path_too(tmp_path: Path) -> None:
    """The rule is unconditional — it applies even when charges_definition
    is entirely omitted, because the bifurcation risk (two independent
    "guest count" inputs) exists for legacy requests too."""
    with pytest.raises(ValueError, match="guest count mismatch"):
        _build(tmp_path, charges_definition=None, persons=80, guest_count=79)


def test_mismatch_error_reports_both_values(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match=r"offer\.persons=80.*event\.guest_count=79"):
        _build(tmp_path, charges_definition=_charges(), persons=80, guest_count=79)


def test_zero_guest_count_with_pauschale_still_rejected_with_its_own_error(
    tmp_path: Path,
) -> None:
    """Zero must be rejected as "not a positive integer", not silently
    reinterpreted as a mismatch against offer.persons — the positivity
    check runs first regardless of what offer.persons is."""
    with pytest.raises(ValueError, match="must be a positive integer or null"):
        _build(
            tmp_path,
            charges_definition=_charges(dishware_base_mode="PAUSCHALE"),
            persons=10,
            guest_count=0,
        )


def test_zero_guest_count_with_pauschale_rejected_even_when_matching_is_impossible(
    tmp_path: Path,
) -> None:
    """offer.persons itself can never be 0 (OfferRequest enforces >= 1), so
    this is the only reachable "zero guests" shape — event.guest_count=0
    against a valid offer.persons. Still correctly rejected."""
    with pytest.raises(ValueError, match="must be a positive integer or null"):
        _build(
            tmp_path,
            charges_definition=_charges(buffet_base_mode="PAUSCHALE"),
            persons=1,
            guest_count=0,
        )


def test_all_per_person_calculations_use_the_same_authoritative_guest_count(
    tmp_path: Path,
) -> None:
    """Catalog per-person pricing and charges_definition Pauschale math are
    computed by completely different code paths (pricing_service vs.
    offer_snapshot_service) — this proves both derive from the same N."""
    guest_count = 42
    snapshot = build_offer_snapshot_v2(
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
        offer=OfferRequest(
            persons=guest_count,
            lines=[
                OfferLineIn(
                    item_id=_SOURCE_ID,
                    quantity_mode="per_person",
                    quantity=1,
                    surcharge_selected=False,
                )
            ],
        ),
        charges_definition=_charges(
            dishware_base_mode="PAUSCHALE", buffet_base_mode="PAUSCHALE"
        ),
    )
    positions = _positions(snapshot)
    catalog = next(p for p in positions if p["kind"] == "catalog")
    dishware = next(p for p in positions if p["kind"] == "dishware")
    buffet = next(p for p in positions if p["kind"] == "buffet_fee")

    # 12.00 € unit price (see _catalog_detail_response current_unit_net_cents)
    assert catalog["net_total_cents"] == 1200 * guest_count
    assert dishware["net_total_cents"] == 200 * guest_count
    assert buffet["net_total_cents"] == 50 * guest_count


# --- issue #171: reusable dishware/equipment return ---------------------------------


def test_next_working_day_return_adds_no_separate_fee(tmp_path: Path) -> None:
    charges = _charges()
    charges["return_logistics"] = {
        "mode": "NEXT_WORKING_DAY",
        "pickup_window_text": None,
        "same_day_fee_cents": 4500,
    }
    snapshot = _build(tmp_path, charges_definition=charges)
    returns = [
        position
        for position in _positions(snapshot)
        if position["kind"] == "fee"
        and position["name"] == "Rückholung am Veranstaltungstag"
    ]
    assert returns == []


def test_same_day_return_materializes_exact_fee_and_totals(tmp_path: Path) -> None:
    charges = _charges()
    charges["return_logistics"] = {
        "mode": "SAME_DAY",
        "pickup_window_text": "22:00-23:00",
        "same_day_fee_cents": 4500,
    }
    snapshot = _build(tmp_path, charges_definition=charges)
    returns = [
        position
        for position in _positions(snapshot)
        if position["kind"] == "fee"
        and position["name"] == "Rückholung am Veranstaltungstag"
    ]
    assert len(returns) == 1
    assert returns[0]["quantity_mode"] == "total"
    assert returns[0]["quantity"] == "1"
    assert returns[0]["unit_net_cents"] == 4500
    assert returns[0]["net_total_cents"] == 4500
    variants = cast(list[dict[str, object]], snapshot["variants"])
    totals = cast(dict[str, int], variants[0]["totals"])
    assert totals["net_cents"] == sum(
        cast(int, position["net_total_cents"]) for position in _positions(snapshot)
    )


def test_same_day_return_requires_pickup_window(tmp_path: Path) -> None:
    charges = _charges()
    charges["return_logistics"] = {
        "mode": "SAME_DAY",
        "pickup_window_text": None,
        "same_day_fee_cents": 4500,
    }
    with pytest.raises(ValueError, match="SAME_DAY return requires pickup_window_text"):
        _build(tmp_path, charges_definition=charges)


def test_next_working_day_return_rejects_pickup_window(tmp_path: Path) -> None:
    charges = _charges()
    charges["return_logistics"] = {
        "mode": "NEXT_WORKING_DAY",
        "pickup_window_text": "22:00-23:00",
        "same_day_fee_cents": 4500,
    }
    with pytest.raises(
        ValueError, match="NEXT_WORKING_DAY return must not specify pickup_window_text"
    ):
        _build(tmp_path, charges_definition=charges)
