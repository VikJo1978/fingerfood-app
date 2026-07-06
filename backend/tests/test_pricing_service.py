"""Pricing unit tests + golden parity fixtures (shared with frontend vitest)."""

import json
from pathlib import Path

from app.models.classification import DietType
from app.models.item import Item
from app.models.offer import OfferLineIn, OfferRequest
from app.services.pricing_service import (
    PAUSCHALE_ANLIEFERUNG_FLAT,
    PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON,
    PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON,
    _line_total,
    _line_warnings,
    price_offer,
)

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "pricing_fixtures.json").read_text()
)


def _item(price: float, price_type: str, min_order: int, unit_label: str) -> Item:
    return Item(
        id="fx-item",
        name="Fixture Item",
        section="Test",
        category="Test",
        price=price,
        price_type=price_type,
        min_order=min_order,
        unit_label=unit_label,
        diet_type=DietType.omnivore,
    )


def test_parity_fixtures_line_totals_and_warnings() -> None:
    for case in FIXTURES["cases"]:
        item = _item(case["price"], case["price_type"], case["min_order"], case["unit_label"])
        total = _line_total(item, case["persons"], case["quantity_mode"], case["quantity"])
        assert round(total, 2) == case["expected_total"], case["name"]
        codes = [w.code for w in _line_warnings(item, case["persons"], case["quantity_mode"], case["quantity"])]
        assert codes == case["expected_warning_codes"], case["name"]


def test_price_offer_subtotal_and_per_person() -> None:
    items = {"a": _item(2.5, "piece", 1, "Stück"), "b": _item(10.0, "person", 1, "Personen")}
    req = OfferRequest(
        persons=20,
        lines=[
            OfferLineIn(item_id="a", quantity_mode="per_person", quantity=2),  # 2.5*2*20 = 100
            OfferLineIn(item_id="b", quantity_mode="total", quantity=20),  # 200
        ],
    )
    resp = price_offer(items, req)
    assert resp.subtotal == 300.0
    assert resp.price_per_person == 15.0
    assert len(resp.lines) == 2
    assert resp.warnings == []


def test_price_offer_unknown_item_warns_and_skips() -> None:
    resp = price_offer({}, OfferRequest(persons=20, lines=[OfferLineIn(item_id="ghost", quantity_mode="total", quantity=1)]))
    assert resp.subtotal == 0.0
    assert [w.code for w in resp.warnings] == ["UNKNOWN_LINE_ITEM"]
    assert resp.lines == []


def test_price_offer_global_low_person_info() -> None:
    resp = price_offer({}, OfferRequest(persons=5, lines=[]))
    assert [w.code for w in resp.warnings] == ["GLOBAL_LOW_PERSON_COUNT"]
    assert resp.warnings[0].severity == "info"


def test_pauschalen_parity_fixtures() -> None:
    for case in FIXTURES["pauschalen_cases"]:
        buffetpauschale = round(PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON * case["persons"], 2)
        geschirrpauschale = round(PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON * case["persons"], 2)
        anlieferung = round(PAUSCHALE_ANLIEFERUNG_FLAT, 2)
        grand_total = round(case["subtotal"] + buffetpauschale + geschirrpauschale + anlieferung, 2)
        assert buffetpauschale == case["expected_buffetpauschale"], case["name"]
        assert geschirrpauschale == case["expected_geschirrpauschale"], case["name"]
        assert anlieferung == case["expected_anlieferung"], case["name"]
        assert grand_total == case["expected_grand_total"], case["name"]


def test_price_offer_includes_pauschalen() -> None:
    resp = price_offer({}, OfferRequest(persons=10, lines=[]))
    assert resp.buffetpauschale == 5.0
    assert resp.geschirrpauschale == 20.0
    assert resp.anlieferung == 35.0
    assert resp.grand_total == 60.0
