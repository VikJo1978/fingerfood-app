"""Build OfferSnapshot V2 request bodies from in-memory drafts."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from app.models.offer import OfferLineIn, OfferRequest


def default_valid_until(event_date: str) -> date:
    try:
        event = date.fromisoformat(event_date)
    except ValueError:
        event = date.today()
    return event - timedelta(days=1)


def draft_to_snapshot_request(
    *,
    inquiry_id: str,
    draft_payload: dict[str, object],
    source_draft_id: str | None = None,
) -> dict[str, object]:
    order_context = draft_payload.get("orderContext")
    if not isinstance(order_context, dict):
        raise ValueError("orderContext required")
    lines_raw = draft_payload.get("lines")
    if not isinstance(lines_raw, list) or not lines_raw:
        raise ValueError("at least one offer line required")
    persons = draft_payload.get("persons")
    if not isinstance(persons, (int, float)) or persons < 1:
        raise ValueError("persons required")

    offer_lines: list[OfferLineIn] = []
    for line in lines_raw:
        if not isinstance(line, dict):
            continue
        item_id = str(line.get("itemId") or "")
        if not item_id:
            continue
        quantity_mode = line.get("quantityMode")
        quantity = line.get("quantity")
        if quantity_mode not in ("total", "per_person") or not isinstance(
            quantity, (int, float)
        ):
            continue
        snapshot = line.get("snapshot")
        surcharge_selected = False
        if isinstance(snapshot, dict):
            surcharge_selected = bool(snapshot.get("surchargeSelected"))
        offer_lines.append(
            OfferLineIn(
                item_id=item_id,
                quantity_mode=quantity_mode,
                quantity=float(quantity),
                surcharge_selected=surcharge_selected,
            )
        )
    if not offer_lines:
        raise ValueError("at least one valid offer line required")

    event_date = str(order_context.get("eventDate") or date.today().isoformat())
    company = str(order_context.get("companyName") or "Angebot")
    contact = str(order_context.get("contactPerson") or company)
    email = str(order_context.get("email") or "kunde@example.invalid")
    location = str(order_context.get("location") or "–")
    billing = str(order_context.get("billingAddress") or location)
    remarks = str(order_context.get("remarks") or "")

    return {
        "inquiry_id": inquiry_id,
        "snapshot_id": str(uuid.uuid4()),
        "valid_until": default_valid_until(event_date).isoformat(),
        "source_draft_id": source_draft_id,
        "recipient": {
            "company_name": company,
            "contact_name": contact,
            "email": email,
            "postal_address": billing,
        },
        "event": {
            "event_date": event_date,
            "time_window_text": str(order_context.get("eventTime") or "–"),
            "location_text": location,
            "guest_count": int(persons),
            "planning_mode": "caterer_suggestion",
        },
        "customer_text": {
            "title": company,
            "introduction": remarks or "Angebot erstellt im Configurator.",
            "notes": remarks,
        },
        "payment_terms": {
            "method": "RECHNUNG",
            "customer_visible_text": "Zahlung per Rechnung",
        },
        "offer": OfferRequest(persons=int(persons), lines=offer_lines).model_dump(),
    }
