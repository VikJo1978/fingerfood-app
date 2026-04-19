from app.models.item import Item
from app.models.offer import LinePricing, OfferRequest, OfferResponse, OfferWarning


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
        line_results.append(
            LinePricing(
                item_id=line.item_id,
                quantity_mode=line.quantity_mode,
                quantity=line.quantity,
                line_total=round(total, 2),
                warnings=_line_warnings(item, req.persons, line.quantity_mode, line.quantity),
            )
        )

    per_person = subtotal / req.persons if req.persons else 0.0
    return OfferResponse(
        persons=req.persons,
        subtotal=round(subtotal, 2),
        price_per_person=round(per_person, 2),
        lines=line_results,
        warnings=global_warnings,
    )
