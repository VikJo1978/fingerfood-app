from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping

from app.models.item import Item
from app.models.offer import LinePricing, OfferRequest, OfferResponse, OfferWarning
from app.services.pricing_math import (
    calculate_vat_cents,
    cents_to_float,
    divide_cents,
    euros_to_cents,
    multiply_cents,
    quantity_decimal,
)

# Real Silberlöffel V1 flat fees, per Cateringangebot.pdf / Lunch_Buffets_2026.pdf /
# Mittagsmenue.pdf (all three agree on Büffetpauschale). Applied unconditionally
# per offer in V1 (not conditioned on pickup vs. delivery or order size — a
# documented approximation, see OfferResponse).
PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON = 0.50
PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON = 2.00
# Anliefergebühr: PDFs show two figures — 30,00 € "Anlieferung im
# HH-Innenstadtgebiet" (delivery only) vs. 35,00 € in the Mittagsmenue T&Cs for
# "Anlieferung, inklusive der Abholung" (delivery + pickup). We use the
# delivery+pickup figure since equipment/chafing dishes are always collected
# afterwards, scoped to the standard zone stated in the source documents
# (Innenstadt Hamburg, barrierefrei, ohne Treppen, direkt anfahrbar) — outside
# that zone/condition this flat figure does not apply and must be adjusted by
# hand; no formula for that case is implemented here.
PAUSCHALE_ANLIEFERUNG_FLAT = 35.00

PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON_CENTS = 50
PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON_CENTS = 200
PAUSCHALE_ANLIEFERUNG_FLAT_CENTS = 3500

# VAT classification (see scripts/derive_vat_rate.py) — owner-stated rule per
# the permanent 7% catering food rate effective 1 Jan 2026 (food incl.
# buffets/packages = 7%; beverages/service/equipment = 19%). The three
# Pauschalen above are service/logistics charges, not food — always 19%.
PAUSCHALEN_VAT_RATE_PERCENT = 19


@dataclass(frozen=True)
class PricingLineCents:
    """Authoritative calculation for one requested offer line."""

    item_id: str
    quantity_mode: str
    quantity: Decimal
    unit_net_cents: int
    base_net_cents: int
    surcharge_unit_net_cents: int
    surcharge_cents: int
    net_cents: int
    vat_rate_percent: int
    vat_cents: int


@dataclass(frozen=True)
class OfferPricingCents:
    """Authoritative cent result behind the legacy float response."""

    lines: tuple[PricingLineCents, ...]
    subtotal_cents: int
    price_per_person_cents: int
    buffetpauschale_cents: int
    geschirrpauschale_cents: int
    anlieferung_cents: int
    grand_total_cents: int
    vat_7_base_cents: int
    vat_7_amount_cents: int
    vat_19_base_cents: int
    vat_19_amount_cents: int
    total_incl_vat_cents: int


def _quantity_multiplier(persons: int, quantity_mode: str) -> int:
    return persons if quantity_mode == "per_person" else 1


def _line_total(item: Item, persons: int, quantity_mode: str, quantity: float) -> float:
    """Legacy float view of the exact cent calculation for one base line."""

    cents = multiply_cents(
        euros_to_cents(item.price),
        quantity,
        multiplier=_quantity_multiplier(persons, quantity_mode),
    )
    return cents_to_float(cents)


def _surcharge_total(
    item: Item,
    persons: int,
    quantity_mode: str,
    quantity: float,
    surcharge_selected: bool,
) -> float:
    """Optional per-line surcharge (see Item.surcharge_amount) — same
    quantity-mode multiplier as the base price, added only when explicitly
    selected for this line. 0.0 for the ~198 items with no surcharge."""
    if not surcharge_selected or not item.surcharge_amount:
        return 0.0
    cents = multiply_cents(
        euros_to_cents(item.surcharge_amount),
        quantity,
        multiplier=_quantity_multiplier(persons, quantity_mode),
    )
    return cents_to_float(cents)


def _line_warnings(
    item: Item, persons: int, quantity_mode: str, quantity: float
) -> list[OfferWarning]:
    warnings: list[OfferWarning] = []
    if (
        quantity_mode == "total"
        and item.price_type == "piece"
        and quantity < item.min_order
    ):
        warnings.append(
            OfferWarning(
                code="MIN_ORDER_PIECE",
                severity="warning",
                message=(
                    "Hinweis: Diese Position wird normalerweise ab "
                    f"{item.min_order} {item.unit_label} bestellt."
                ),
            )
        )
    if quantity_mode == "per_person" and persons < 10:
        warnings.append(
            OfferWarning(
                code="PER_PERSON_BELOW_USUAL_MIN_PERSONS",
                severity="warning",
                message=(
                    "Hinweis: Diese Konfiguration liegt unter dem üblichen Mindest-Personenzahl (10)."
                ),
            )
        )
    if (
        quantity_mode == "total"
        and item.price_type == "person"
        and quantity < item.min_order
    ):
        warnings.append(
            OfferWarning(
                code="MIN_ORDER_PERSON",
                severity="warning",
                message=(
                    f"Hinweis: Übliches Minimum: {item.min_order} Personen für diese Position."
                ),
            )
        )
    return warnings


def calculate_offer_cents(
    items: Mapping[str, Item],
    req: OfferRequest,
    *,
    unit_net_cents_by_item_id: Mapping[str, int] | None = None,
) -> OfferPricingCents:
    """Calculate authoritative offer money without binary-float arithmetic."""

    authoritative_prices = unit_net_cents_by_item_id or {}
    line_results: list[PricingLineCents] = []
    for line in req.lines:
        item = items.get(line.item_id)
        if item is None:
            continue
        quantity = quantity_decimal(line.quantity)
        multiplier = _quantity_multiplier(req.persons, line.quantity_mode)
        unit_net_cents = authoritative_prices.get(
            line.item_id, euros_to_cents(item.price)
        )
        base_net_cents = multiply_cents(
            unit_net_cents,
            quantity,
            multiplier=multiplier,
        )
        surcharge_unit_net_cents = (
            euros_to_cents(item.surcharge_amount)
            if line.surcharge_selected and item.surcharge_amount
            else 0
        )
        surcharge_cents = multiply_cents(
            surcharge_unit_net_cents,
            quantity,
            multiplier=multiplier,
        )
        net_cents = base_net_cents + surcharge_cents
        line_results.append(
            PricingLineCents(
                item_id=line.item_id,
                quantity_mode=line.quantity_mode,
                quantity=quantity,
                unit_net_cents=unit_net_cents,
                base_net_cents=base_net_cents,
                surcharge_unit_net_cents=surcharge_unit_net_cents,
                surcharge_cents=surcharge_cents,
                net_cents=net_cents,
                vat_rate_percent=item.vat_rate_percent,
                vat_cents=calculate_vat_cents(net_cents, item.vat_rate_percent),
            )
        )

    subtotal_cents = sum(line.net_cents for line in line_results)
    price_per_person_cents = divide_cents(subtotal_cents, req.persons)

    # Pauschalen only apply to an actual order — an empty offer (no priced
    # lines) has nothing to deliver, set up, or provide tableware for. Bug
    # found 2026-07-06: these were previously computed from `persons` alone,
    # so an empty draft already showed 60,00 € before anything was added.
    has_order = bool(line_results)
    buffetpauschale_cents = (
        PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON_CENTS * req.persons if has_order else 0
    )
    geschirrpauschale_cents = (
        PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON_CENTS * req.persons if has_order else 0
    )
    anlieferung_cents = PAUSCHALE_ANLIEFERUNG_FLAT_CENTS if has_order else 0
    grand_total_cents = (
        subtotal_cents
        + buffetpauschale_cents
        + geschirrpauschale_cents
        + anlieferung_cents
    )

    # Pauschalen are always 19% (service/logistics charges).
    vat_7_lines = tuple(line for line in line_results if line.vat_rate_percent == 7)
    vat_19_lines = tuple(line for line in line_results if line.vat_rate_percent == 19)
    vat_7_base_cents = sum(line.net_cents for line in vat_7_lines)
    vat_7_amount_cents = sum(line.vat_cents for line in vat_7_lines)
    vat_19_base_cents = (
        sum(line.net_cents for line in vat_19_lines)
        + buffetpauschale_cents
        + geschirrpauschale_cents
        + anlieferung_cents
    )
    vat_19_amount_cents = (
        sum(line.vat_cents for line in vat_19_lines)
        + calculate_vat_cents(buffetpauschale_cents, PAUSCHALEN_VAT_RATE_PERCENT)
        + calculate_vat_cents(geschirrpauschale_cents, PAUSCHALEN_VAT_RATE_PERCENT)
        + calculate_vat_cents(anlieferung_cents, PAUSCHALEN_VAT_RATE_PERCENT)
    )
    total_incl_vat_cents = grand_total_cents + vat_7_amount_cents + vat_19_amount_cents

    return OfferPricingCents(
        lines=tuple(line_results),
        subtotal_cents=subtotal_cents,
        price_per_person_cents=price_per_person_cents,
        buffetpauschale_cents=buffetpauschale_cents,
        geschirrpauschale_cents=geschirrpauschale_cents,
        anlieferung_cents=anlieferung_cents,
        grand_total_cents=grand_total_cents,
        vat_7_base_cents=vat_7_base_cents,
        vat_7_amount_cents=vat_7_amount_cents,
        vat_19_base_cents=vat_19_base_cents,
        vat_19_amount_cents=vat_19_amount_cents,
        total_incl_vat_cents=total_incl_vat_cents,
    )


def price_offer(
    items: dict[str, Item],
    req: OfferRequest,
    *,
    unit_net_cents_by_item_id: Mapping[str, int] | None = None,
) -> OfferResponse:
    """Return the legacy float API view of the authoritative cent result."""

    priced = calculate_offer_cents(
        items,
        req,
        unit_net_cents_by_item_id=unit_net_cents_by_item_id,
    )
    line_results: list[LinePricing] = []
    global_warnings: list[OfferWarning] = []
    if req.persons < 10:
        global_warnings.append(
            OfferWarning(
                code="GLOBAL_LOW_PERSON_COUNT",
                severity="info",
                message=(
                    "Hinweis: Viele Angebote und Positionen sind erst ab 10 Personen vorgesehen."
                ),
            )
        )

    priced_lines = iter(priced.lines)
    for line in req.lines:
        item = items.get(line.item_id)
        if item is None:
            global_warnings.append(
                OfferWarning(
                    code="UNKNOWN_LINE_ITEM",
                    severity="warning",
                    message=f"Unbekannte Position: {line.item_id}",
                )
            )
            continue
        calculated = next(priced_lines)
        line_results.append(
            LinePricing(
                item_id=line.item_id,
                quantity_mode=line.quantity_mode,
                quantity=line.quantity,
                line_total=cents_to_float(calculated.net_cents),
                warnings=_line_warnings(
                    item,
                    req.persons,
                    line.quantity_mode,
                    line.quantity,
                ),
                vat_rate_percent=calculated.vat_rate_percent,
                vat_amount=cents_to_float(calculated.vat_cents),
                surcharge_amount=cents_to_float(calculated.surcharge_cents),
            )
        )

    return OfferResponse(
        persons=req.persons,
        subtotal=cents_to_float(priced.subtotal_cents),
        price_per_person=cents_to_float(priced.price_per_person_cents),
        lines=line_results,
        warnings=global_warnings,
        buffetpauschale=cents_to_float(priced.buffetpauschale_cents),
        geschirrpauschale=cents_to_float(priced.geschirrpauschale_cents),
        anlieferung=cents_to_float(priced.anlieferung_cents),
        grand_total=cents_to_float(priced.grand_total_cents),
        vat_7_percent_base=cents_to_float(priced.vat_7_base_cents),
        vat_7_percent_amount=cents_to_float(priced.vat_7_amount_cents),
        vat_19_percent_base=cents_to_float(priced.vat_19_base_cents),
        vat_19_percent_amount=cents_to_float(priced.vat_19_amount_cents),
        total_incl_vat=cents_to_float(priced.total_incl_vat_cents),
    )
