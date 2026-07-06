from app.models.item import Item
from app.models.offer import LinePricing, OfferRequest, OfferResponse, OfferWarning

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

# VAT classification (see scripts/derive_vat_rate.py) — owner-stated rule per
# the permanent 7% catering food rate effective 1 Jan 2026 (food incl.
# buffets/packages = 7%; beverages/service/equipment = 19%). The three
# Pauschalen above are service/logistics charges, not food — always 19%.
PAUSCHALEN_VAT_RATE_PERCENT = 19


def _line_total(item: Item, persons: int, quantity_mode: str, quantity: float) -> float:
    if item.price_type == "piece":
        if quantity_mode == "total":
            return item.price * quantity
        return item.price * quantity * persons
    # person-based price
    if quantity_mode == "total":
        return item.price * quantity
    return item.price * quantity * persons


def _line_warnings(item: Item, persons: int, quantity_mode: str, quantity: float) -> list[OfferWarning]:
    warnings: list[OfferWarning] = []
    if quantity_mode == "total" and item.price_type == "piece" and quantity < item.min_order:
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
    if quantity_mode == "total" and item.price_type == "person" and quantity < item.min_order:
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


def price_offer(items: dict[str, Item], req: OfferRequest) -> OfferResponse:
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

    subtotal = 0.0
    vat_7_base = 0.0
    vat_19_base = 0.0
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
        total = _line_total(item, req.persons, line.quantity_mode, line.quantity)
        subtotal += total
        if item.vat_rate_percent == 7:
            vat_7_base += total
        else:
            vat_19_base += total
        line_results.append(
            LinePricing(
                item_id=line.item_id,
                quantity_mode=line.quantity_mode,
                quantity=line.quantity,
                line_total=round(total, 2),
                warnings=_line_warnings(item, req.persons, line.quantity_mode, line.quantity),
                vat_rate_percent=item.vat_rate_percent,
                vat_amount=round(total * item.vat_rate_percent / 100, 2),
            )
        )

    per_person = subtotal / req.persons if req.persons else 0.0
    buffetpauschale = round(PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON * req.persons, 2)
    geschirrpauschale = round(PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON * req.persons, 2)
    anlieferung = round(PAUSCHALE_ANLIEFERUNG_FLAT, 2)
    grand_total = round(subtotal + buffetpauschale + geschirrpauschale + anlieferung, 2)

    # Pauschalen are always 19% (service/logistics charges).
    vat_19_base += buffetpauschale + geschirrpauschale + anlieferung
    vat_7_amount = round(vat_7_base * 7 / 100, 2)
    vat_19_amount = round(vat_19_base * 19 / 100, 2)
    total_incl_vat = round(grand_total + vat_7_amount + vat_19_amount, 2)

    return OfferResponse(
        persons=req.persons,
        subtotal=round(subtotal, 2),
        price_per_person=round(per_person, 2),
        lines=line_results,
        warnings=global_warnings,
        buffetpauschale=buffetpauschale,
        geschirrpauschale=geschirrpauschale,
        anlieferung=anlieferung,
        grand_total=grand_total,
        vat_7_percent_base=round(vat_7_base, 2),
        vat_7_percent_amount=vat_7_amount,
        vat_19_percent_base=round(vat_19_base, 2),
        vat_19_percent_amount=vat_19_amount,
        total_incl_vat=total_incl_vat,
    )
