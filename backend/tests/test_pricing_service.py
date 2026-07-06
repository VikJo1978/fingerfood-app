"""Pricing unit tests + golden parity fixtures (shared with frontend vitest)."""

import json
from pathlib import Path

from app.core.config import settings
from app.models.classification import DietType
from app.models.item import Item
from app.models.offer import OfferLineIn, OfferRequest
from app.services.item_service import load_items
from app.services.pricing_service import (
    PAUSCHALE_ANLIEFERUNG_FLAT,
    PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON,
    PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON,
    _line_total,
    _line_warnings,
    _surcharge_total,
    price_offer,
)

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "pricing_fixtures.json").read_text()
)


def _item(
    price: float,
    price_type: str,
    min_order: int,
    unit_label: str,
    surcharge_amount: float | None = None,
) -> Item:
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
        surcharge_amount=surcharge_amount,
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
        has_lines = case["has_lines"]
        buffetpauschale = round(PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON * case["persons"], 2) if has_lines else 0.0
        geschirrpauschale = (
            round(PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON * case["persons"], 2) if has_lines else 0.0
        )
        anlieferung = round(PAUSCHALE_ANLIEFERUNG_FLAT, 2) if has_lines else 0.0
        grand_total = round(case["subtotal"] + buffetpauschale + geschirrpauschale + anlieferung, 2)
        assert buffetpauschale == case["expected_buffetpauschale"], case["name"]
        assert geschirrpauschale == case["expected_geschirrpauschale"], case["name"]
        assert anlieferung == case["expected_anlieferung"], case["name"]
        assert grand_total == case["expected_grand_total"], case["name"]


def test_price_offer_includes_pauschalen_when_order_has_items() -> None:
    item = _item(1.0, "piece", 1, "Stück")
    resp = price_offer(
        {"a": item}, OfferRequest(persons=10, lines=[OfferLineIn(item_id="a", quantity_mode="total", quantity=1)])
    )
    assert resp.buffetpauschale == 5.0
    assert resp.geschirrpauschale == 20.0
    assert resp.anlieferung == 35.0
    assert resp.grand_total == round(1.0 + 60.0, 2)


def test_price_offer_empty_lines_has_zero_pauschalen() -> None:
    """Bug found 2026-07-06: an offer with zero lines was still charging
    Pauschalen from `persons` alone — nothing to deliver/set up for an empty
    order. Fixed: Pauschalen are 0 when there are no priced lines."""
    resp = price_offer({}, OfferRequest(persons=10, lines=[]))
    assert resp.buffetpauschale == 0.0
    assert resp.geschirrpauschale == 0.0
    assert resp.anlieferung == 0.0
    assert resp.grand_total == 0.0
    assert resp.vat_7_percent_amount == 0.0
    assert resp.vat_19_percent_amount == 0.0
    assert resp.total_incl_vat == 0.0


def test_vat_classification_and_pauschalen_are_19_percent() -> None:
    """An order with items (so Pauschalen apply): Pauschalen carry VAT at 19%."""
    item = _item(1.0, "piece", 1, "Stück")  # vat_rate_percent defaults to 19 on _item()
    resp = price_offer(
        {"a": item}, OfferRequest(persons=10, lines=[OfferLineIn(item_id="a", quantity_mode="total", quantity=1)])
    )
    assert resp.vat_19_percent_base == 61.0  # 1.0 line + 5 + 20 + 35 Pauschalen
    assert resp.vat_19_percent_amount == round(61.0 * 0.19, 2)


def test_vat_splits_lines_by_item_rate() -> None:
    item_7 = _item(2.0, "piece", 1, "Stück")  # module="food" default via Item(...); vat default 19 unless set
    item_7 = item_7.model_copy(update={"vat_rate_percent": 7})
    item_19 = _item(3.0, "piece", 1, "Stück").model_copy(update={"vat_rate_percent": 19})
    items = {"a": item_7, "b": item_19}
    req = OfferRequest(
        persons=10,
        lines=[
            OfferLineIn(item_id="a", quantity_mode="total", quantity=10),  # 20.0 net @7%
            OfferLineIn(item_id="b", quantity_mode="total", quantity=10),  # 30.0 net @19%
        ],
    )
    resp = price_offer(items, req)
    assert resp.subtotal == 50.0
    assert resp.vat_7_percent_base == 20.0
    assert resp.vat_7_percent_amount == 1.40
    # 30.0 line + 60.0 Pauschalen (10 persons) = 90.0 base @19%
    assert resp.vat_19_percent_base == 90.0
    assert resp.vat_19_percent_amount == 17.10
    line_a = next(l for l in resp.lines if l.item_id == "a")
    assert line_a.vat_rate_percent == 7
    assert line_a.vat_amount == 1.40


def test_vat_arithmetic_parity_fixtures() -> None:
    for case in FIXTURES["vat_cases"]:
        vat7 = round(case["vat7_base"] * 0.07, 2)
        vat19 = round(case["vat19_base"] * 0.19, 2)
        total_incl = round(case["grand_total"] + vat7 + vat19, 2)
        assert vat7 == case["expected_vat7_amount"], case["name"]
        assert vat19 == case["expected_vat19_amount"], case["name"]
        assert total_incl == case["expected_total_incl_vat"], case["name"]


def test_surcharge_parity_fixtures() -> None:
    """Optional per-item surcharge (see Item.surcharge_amount) — one checkbox
    per item, no generic variant system. Prices/quantities mirror the real
    catalog items (Brötchen Mix 3 2,60€, Sandwiches 3,30€, Bagels 3,45€)."""
    for case in FIXTURES["surcharge_cases"]:
        item = _item(
            case["price"], case["price_type"], case["min_order"], case["unit_label"],
            surcharge_amount=case["surcharge_amount"],
        )
        base = _line_total(item, case["persons"], case["quantity_mode"], case["quantity"])
        surcharge = _surcharge_total(
            item, case["persons"], case["quantity_mode"], case["quantity"], case["surcharge_selected"]
        )
        assert round(base + surcharge, 2) == case["expected_total"], case["name"]


def test_price_offer_surcharge_real_catalog_items() -> None:
    """Real affected items (owner-confirmed 2026-07-06, live): Brötchen Mix 3,
    Sandwiches, Bagels each carry a "+1,00 € Aufpreis für Lachs oder Rind"
    menu note the fixed catalog price alone can't express."""
    items = {i.id: i for i in load_items(settings.items_json_path)}
    broetchen = items["broetchen-mix-3"]
    assert broetchen.surcharge_label == "Lachs oder Rind"
    assert broetchen.surcharge_amount == 1.0

    resp_off = price_offer(
        items,
        OfferRequest(
            persons=10,
            lines=[OfferLineIn(item_id="broetchen-mix-3", quantity_mode="total", quantity=10)],
        ),
    )
    assert resp_off.lines[0].line_total == 26.0  # 2.60 * 10, surcharge not selected
    assert resp_off.lines[0].surcharge_amount == 0.0

    resp_on = price_offer(
        items,
        OfferRequest(
            persons=10,
            lines=[
                OfferLineIn(
                    item_id="broetchen-mix-3", quantity_mode="total", quantity=10, surcharge_selected=True
                )
            ],
        ),
    )
    assert resp_on.lines[0].line_total == 36.0  # 26.0 base + 1.00*10 surcharge
    assert resp_on.lines[0].surcharge_amount == 10.0
    assert resp_on.lines[0].vat_rate_percent == 7  # still food, same VAT treatment
    assert resp_on.lines[0].vat_amount == round(36.0 * 0.07, 2)


def test_surcharge_selected_ignored_when_item_has_none() -> None:
    item = _item(2.30, "piece", 1, "Stück")  # no surcharge configured
    resp = price_offer(
        {"a": item},
        OfferRequest(
            persons=10,
            lines=[OfferLineIn(item_id="a", quantity_mode="total", quantity=10, surcharge_selected=True)],
        ),
    )
    assert resp.lines[0].line_total == 23.0
    assert resp.lines[0].surcharge_amount == 0.0
