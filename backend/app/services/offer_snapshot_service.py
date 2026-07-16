"""Build OfferSnapshot V2 envelopes for Core prepare-offer."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

from app.models.offer import OfferLineIn, OfferRequest
from app.models.resolved_catalog import ResolvedCatalogLine
from app.services.catalog_adapter import CatalogAdapter
from app.services.pricing_service import (
    OfferPricingCents,
    PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON_CENTS,
    PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON_CENTS,
    PAUSCHALEN_VAT_RATE_PERCENT,
    PricingLineCents,
    calculate_offer_cents,
)
from app.services.pricing_math import calculate_vat_cents
from app.services.snapshot_hash import compute_snapshot_hash

SCHEMA_VERSION_V2 = "offer_snapshot_v2"
SOURCE = "fingerfood-configurator-backend"
CURRENCY = "EUR"
CALCULATOR_NAME = "fingerfood-backend"


def _quantity_string(value: float) -> str:
    text = format(Decimal(str(value)).normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _build_catalog_position(
    *,
    resolved: ResolvedCatalogLine,
    line: OfferLineIn,
    pricing_line: PricingLineCents,
    position_id: str,
) -> dict[str, object]:
    unit_net = pricing_line.unit_net_cents
    net_total = pricing_line.base_net_cents
    vat_rate = pricing_line.vat_rate_percent
    vat_amount = calculate_vat_cents(net_total, vat_rate)
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


def _build_charge_position(
    *,
    kind: Literal["surcharge", "fee"],
    name: str,
    quantity_mode: Literal["total", "per_person"],
    quantity: str,
    unit_label: str,
    unit_net_cents: int,
    net_total_cents: int,
    vat_rate_percent: int,
    related_position_id: str | None = None,
) -> dict[str, object]:
    vat_amount_cents = calculate_vat_cents(net_total_cents, vat_rate_percent)
    return {
        "position_id": str(uuid.uuid4()),
        "kind": kind,
        "catalog_item_id": None,
        "name": name,
        "description": None,
        "composition": None,
        "quantity_mode": quantity_mode,
        "quantity": quantity,
        "unit_label": unit_label,
        "unit_net_cents": unit_net_cents,
        "net_total_cents": net_total_cents,
        "vat_rate_percent": vat_rate_percent,
        "vat_amount_cents": vat_amount_cents,
        "gross_total_cents": net_total_cents + vat_amount_cents,
        "notes": None,
        "related_position_id": related_position_id,
        "allergens": None,
        "vegan": None,
        "vegetarian": None,
    }


def _build_surcharge_position(
    *,
    resolved: ResolvedCatalogLine,
    line: OfferLineIn,
    pricing_line: PricingLineCents,
    related_position_id: str,
) -> dict[str, object] | None:
    if pricing_line.surcharge_cents == 0:
        return None
    label = resolved.item.surcharge_label or "Aufpreis"
    return _build_charge_position(
        kind="surcharge",
        name=f"Aufpreis: {label}",
        quantity_mode=line.quantity_mode,
        quantity=_quantity_string(line.quantity),
        unit_label=resolved.item.unit_label,
        unit_net_cents=pricing_line.surcharge_unit_net_cents,
        net_total_cents=pricing_line.surcharge_cents,
        vat_rate_percent=pricing_line.vat_rate_percent,
        related_position_id=related_position_id,
    )


def _build_fee_positions(
    priced: OfferPricingCents, *, persons: int
) -> list[dict[str, object]]:
    if not priced.lines:
        return []
    return [
        _build_charge_position(
            kind="fee",
            name="Büffetpauschale",
            quantity_mode="total",
            quantity=str(persons),
            unit_label="Person",
            unit_net_cents=PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON_CENTS,
            net_total_cents=priced.buffetpauschale_cents,
            vat_rate_percent=PAUSCHALEN_VAT_RATE_PERCENT,
        ),
        _build_charge_position(
            kind="fee",
            name="Geschirrpauschale",
            quantity_mode="total",
            quantity=str(persons),
            unit_label="Person",
            unit_net_cents=PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON_CENTS,
            net_total_cents=priced.geschirrpauschale_cents,
            vat_rate_percent=PAUSCHALEN_VAT_RATE_PERCENT,
        ),
        _build_charge_position(
            kind="fee",
            name="Anlieferung",
            quantity_mode="total",
            quantity="1",
            unit_label="Pauschale",
            unit_net_cents=priced.anlieferung_cents,
            net_total_cents=priced.anlieferung_cents,
            vat_rate_percent=PAUSCHALEN_VAT_RATE_PERCENT,
        ),
    ]


def _position_int(position: dict[str, object], field: str) -> int:
    value = position.get(field)
    if type(value) is not int or value < 0:
        raise ValueError(f"position {field} must be a non-negative integer")
    return value


def _calculate_totals_from_positions(
    positions: list[dict[str, object]],
) -> dict[str, int]:
    net_cents = 0
    vat_7_base_cents = 0
    vat_7_amount_cents = 0
    vat_19_base_cents = 0
    vat_19_amount_cents = 0
    gross_cents = 0

    for position in positions:
        position_net = _position_int(position, "net_total_cents")
        position_vat = _position_int(position, "vat_amount_cents")
        position_gross = _position_int(position, "gross_total_cents")
        vat_rate = _position_int(position, "vat_rate_percent")

        net_cents += position_net
        gross_cents += position_gross
        if vat_rate == 7:
            vat_7_base_cents += position_net
            vat_7_amount_cents += position_vat
        elif vat_rate == 19:
            vat_19_base_cents += position_net
            vat_19_amount_cents += position_vat
        else:
            raise ValueError("position vat_rate_percent must be 7 or 19")

    return {
        "net_cents": net_cents,
        "vat_7_base_cents": vat_7_base_cents,
        "vat_7_amount_cents": vat_7_amount_cents,
        "vat_19_base_cents": vat_19_base_cents,
        "vat_19_amount_cents": vat_19_amount_cents,
        "gross_cents": gross_cents,
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
    priced = calculate_offer_cents(
        load.items,
        offer,
        unit_net_cents_by_item_id=load.unit_net_cents_by_item_id,
    )

    positions: list[dict[str, object]] = []
    priced_lines = iter(priced.lines)
    for line in offer.lines:
        if line.item_id not in load.items:
            continue
        pricing_line = next(priced_lines)
        resolved = adapter.resolve_line(line.item_id)
        if resolved is None:
            continue
        base_position_id = str(uuid.uuid4())
        positions.append(
            _build_catalog_position(
                resolved=resolved,
                line=line,
                pricing_line=pricing_line,
                position_id=base_position_id,
            )
        )
        surcharge = _build_surcharge_position(
            resolved=resolved,
            line=line,
            pricing_line=pricing_line,
            related_position_id=base_position_id,
        )
        if surcharge is not None:
            positions.append(surcharge)

    if not positions:
        raise ValueError("snapshot requires at least one catalog position")

    positions.extend(_build_fee_positions(priced, persons=offer.persons))

    totals = _calculate_totals_from_positions(positions)
    body: dict[str, object] = {
        "schema_version": SCHEMA_VERSION_V2,
        "source": SOURCE,
        "source_draft_id": source_draft_id,
        "inquiry_id": inquiry_id,
        "snapshot_id": snapshot_id,
        "snapshot_created_at": (
            snapshot_created_at or datetime.now(tz=UTC)
        ).isoformat(),
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
