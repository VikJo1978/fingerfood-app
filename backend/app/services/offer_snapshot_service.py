"""Build OfferSnapshot V2 envelopes for Core prepare-offer."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal, ROUND_HALF_UP

from app.models.offer import OfferLineIn, OfferRequest, OfferResponse
from app.models.resolved_catalog import ResolvedCatalogLine
from app.services.catalog_adapter import CatalogAdapter
from app.services.pricing_service import price_offer
from app.services.snapshot_hash import compute_snapshot_hash

SCHEMA_VERSION_V2 = "offer_snapshot_v2"
SOURCE = "fingerfood-configurator-backend"
CURRENCY = "EUR"
CALCULATOR_NAME = "fingerfood-backend"


def _cents(value: float) -> int:
    return int(
        (Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )


def _quantity_string(value: float) -> str:
    text = format(Decimal(str(value)).normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _build_catalog_position(
    *,
    resolved: ResolvedCatalogLine,
    line: OfferLineIn,
    pricing_line,
    position_id: str,
) -> dict[str, object]:
    unit_net = resolved.unit_net_cents
    net_total = _cents(pricing_line.line_total)
    vat_rate = pricing_line.vat_rate_percent
    vat_amount = _cents(pricing_line.vat_amount)
    gross_total = net_total + vat_amount
    return {
        "position_id": position_id,
        "kind": "catalog",
        "catalog_item_id": resolved.catalog_item_id,
        "name": resolved.item.name,
        "description": resolved.description,
        "composition": resolved.composition,
        "quantity_mode": line.quantity_mode,
        "quantity": _quantity_string(line.quantity),
        "unit_label": resolved.item.unit_label,
        "unit_net_cents": unit_net,
        "net_total_cents": net_total,
        "vat_rate_percent": vat_rate,
        "vat_amount_cents": vat_amount,
        "gross_total_cents": gross_total,
        "notes": None,
        "related_position_id": None,
        "allergens": list(resolved.allergens),
        "vegan": None,
        "vegetarian": None,
    }


def build_offer_snapshot_v2(
    *,
    adapter: CatalogAdapter,
    inquiry_id: str,
    snapshot_id: str,
    valid_until: date,
    recipient: dict[str, str],
    event: dict[str, object],
    customer_text: dict[str, str],
    payment_terms: dict[str, str],
    offer: OfferRequest,
    source_draft_id: str | None = None,
    catalog_revision: str = "core-catalog-v1",
    snapshot_created_at: datetime | None = None,
) -> dict[str, object]:
    """Compose OfferSnapshot V2 from resolved Catalog lines + pricing."""
    load = adapter.load_items_for_compose()
    priced = price_offer(load.items, offer)

    positions: list[dict[str, object]] = []
    priced_by_item = {line.item_id: line for line in priced.lines}
    for line in offer.lines:
        resolved = adapter.resolve_line(line.item_id)
        if resolved is None:
            continue
        pricing_line = priced_by_item.get(line.item_id)
        if pricing_line is None:
            continue
        positions.append(
            _build_catalog_position(
                resolved=resolved,
                line=line,
                pricing_line=pricing_line,
                position_id=str(uuid.uuid4()),
            )
        )

    if not positions:
        raise ValueError("snapshot requires at least one catalog position")

    totals = _variant_totals(priced)
    body: dict[str, object] = {
        "schema_version": SCHEMA_VERSION_V2,
        "source": SOURCE,
        "source_draft_id": source_draft_id,
        "inquiry_id": inquiry_id,
        "snapshot_id": snapshot_id,
        "snapshot_created_at": (snapshot_created_at or datetime.now(tz=UTC)).isoformat(),
        "valid_until": valid_until.isoformat(),
        "currency": CURRENCY,
        "recipient": recipient,
        "event": event,
        "customer_text": customer_text,
        "payment_terms": payment_terms,
        "calculator": {
            "name": CALCULATOR_NAME,
            "calculator_revision": "v2-catalog-adapter",
            "catalog_revision": catalog_revision,
            "tax_revision": "v1",
        },
        "variants": [
            {
                "variant_id": str(uuid.uuid4()),
                "label": customer_text.get("title") or "Variante A",
                "description": customer_text.get("introduction") or "",
                "positions": positions,
                "totals": totals,
            }
        ],
    }
    body["snapshot_hash"] = compute_snapshot_hash(body)
    return body


def _variant_totals(priced: OfferResponse) -> dict[str, int]:
    net = _cents(priced.subtotal)
    vat7 = _cents(priced.vat_7_percent_amount)
    vat19 = _cents(priced.vat_19_percent_amount)
    base7 = _cents(priced.vat_7_percent_base)
    base19 = _cents(priced.vat_19_percent_base)
    gross = _cents(priced.total_incl_vat)
    return {
        "net_cents": net,
        "vat_7_base_cents": base7,
        "vat_7_amount_cents": vat7,
        "vat_19_base_cents": base19,
        "vat_19_amount_cents": vat19,
        "gross_cents": gross,
    }
