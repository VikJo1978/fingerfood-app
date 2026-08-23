"""Deterministic assembly of complete recommendation variants for issue #151."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.models.item import Item
from app.services.recommendation_engine import RecommendationCandidate

VariantKind = Literal["ECONOMIC", "RECOMMENDED", "PREMIUM"]


@dataclass(frozen=True)
class RecommendationVariantLine:
    item_id: str
    quantity: int
    unit_net_cents: int
    net_total_cents: int
    score: int
    explanations: tuple[str, ...]


@dataclass(frozen=True)
class RecommendationVariant:
    kind: VariantKind
    label: str
    lines: tuple[RecommendationVariantLine, ...]
    net_total_cents: int
    explanations: tuple[str, ...]


_TARGET_LINE_COUNT: dict[VariantKind, int] = {
    "ECONOMIC": 3,
    "RECOMMENDED": 4,
    "PREMIUM": 5,
}

_LABELS: dict[VariantKind, str] = {
    "ECONOMIC": "Wirtschaftlich",
    "RECOMMENDED": "Empfohlen",
    "PREMIUM": "Premium",
}


def assemble_variant(
    kind: VariantKind,
    items: list[Item],
    ranked_candidates: list[RecommendationCandidate],
    unit_net_cents_by_item_id: dict[str, int],
    *,
    guest_count: int,
    piece_quantity_by_item_id: dict[str, int] | None = None,
    max_variant_net_cents: int | None = None,
) -> RecommendationVariant | None:
    """Assemble one variant from candidates already ranked for ``kind``.

    Per-person positions scale with guest count. Piece positions use explicit demand
    when supplied and otherwise fall back to the catalog minimum. The fallback is
    exposed in line explanations so it cannot masquerade as a serving estimate.
    """

    if guest_count <= 0:
        raise ValueError("guest_count must be positive")
    piece_quantities = _validated_piece_quantities(piece_quantity_by_item_id)

    item_by_id = {item.id: item for item in items}
    eligible = [candidate for candidate in ranked_candidates if candidate.eligible]
    return _assemble_one(
        kind,
        item_by_id,
        eligible,
        unit_net_cents_by_item_id,
        guest_count=guest_count,
        piece_quantity_by_item_id=piece_quantities,
        max_variant_net_cents=max_variant_net_cents,
    )


def assemble_variants(
    items: list[Item],
    ranked_candidates: list[RecommendationCandidate],
    unit_net_cents_by_item_id: dict[str, int],
    *,
    guest_count: int,
    piece_quantity_by_item_id: dict[str, int] | None = None,
    max_variant_net_cents: int | None = None,
) -> tuple[RecommendationVariant, ...]:
    """Legacy helper building three variants from one ranking.

    New recommendation orchestration must rank each profile independently and call
    :func:`assemble_variant`. This helper remains for compatibility with existing
    callers and tests while that migration is completed.
    """

    if guest_count <= 0:
        raise ValueError("guest_count must be positive")
    piece_quantities = _validated_piece_quantities(piece_quantity_by_item_id)

    item_by_id = {item.id: item for item in items}
    eligible = [candidate for candidate in ranked_candidates if candidate.eligible]
    variants: list[RecommendationVariant] = []
    for kind in ("ECONOMIC", "RECOMMENDED", "PREMIUM"):
        ordered = _ordered_for_variant(kind, eligible, unit_net_cents_by_item_id)
        variant = _assemble_one(
            kind,
            item_by_id,
            ordered,
            unit_net_cents_by_item_id,
            guest_count=guest_count,
            piece_quantity_by_item_id=piece_quantities,
            max_variant_net_cents=max_variant_net_cents,
        )
        if variant is not None:
            variants.append(variant)
    return tuple(variants)


def _assemble_one(
    kind: VariantKind,
    item_by_id: dict[str, Item],
    candidates: list[RecommendationCandidate],
    unit_net_cents_by_item_id: dict[str, int],
    *,
    guest_count: int,
    piece_quantity_by_item_id: dict[str, int],
    max_variant_net_cents: int | None,
) -> RecommendationVariant | None:
    lines: list[RecommendationVariantLine] = []
    running_total = 0
    target = _TARGET_LINE_COUNT[kind]

    for candidate in candidates:
        if len(lines) >= target:
            break
        item = item_by_id.get(candidate.item_id)
        unit_net_cents = unit_net_cents_by_item_id.get(candidate.item_id)
        if item is None or unit_net_cents is None:
            continue
        quantity, quantity_explanations = _quantity_for_item(
            item,
            guest_count,
            piece_quantity_by_item_id,
        )
        line_total = quantity * unit_net_cents
        if (
            max_variant_net_cents is not None
            and running_total + line_total > max_variant_net_cents
        ):
            continue
        lines.append(
            RecommendationVariantLine(
                item_id=item.id,
                quantity=quantity,
                unit_net_cents=unit_net_cents,
                net_total_cents=line_total,
                score=candidate.score,
                explanations=candidate.explanations + quantity_explanations,
            )
        )
        running_total += line_total

    if not lines:
        return None

    return RecommendationVariant(
        kind=kind,
        label=_LABELS[kind],
        lines=tuple(lines),
        net_total_cents=running_total,
        explanations=(
            f"deterministic {kind.lower()} assembly",
            f"{len(lines)} eligible catalog lines",
        ),
    )


def _ordered_for_variant(
    kind: VariantKind,
    candidates: list[RecommendationCandidate],
    unit_net_cents_by_item_id: dict[str, int],
) -> list[RecommendationCandidate]:
    def price(candidate: RecommendationCandidate) -> int:
        return unit_net_cents_by_item_id.get(candidate.item_id, 10**12)

    if kind == "ECONOMIC":
        return sorted(candidates, key=lambda c: (price(c), -c.score, c.item_id))
    if kind == "PREMIUM":
        return sorted(candidates, key=lambda c: (-price(c), -c.score, c.item_id))
    return sorted(candidates, key=lambda c: (-c.score, price(c), c.item_id))


def _validated_piece_quantities(
    values: dict[str, int] | None,
) -> dict[str, int]:
    quantities = dict(values or {})
    if any(quantity <= 0 for quantity in quantities.values()):
        raise ValueError("piece quantities must be positive")
    return quantities


def _quantity_for_item(
    item: Item,
    guest_count: int,
    piece_quantity_by_item_id: dict[str, int],
) -> tuple[int, tuple[str, ...]]:
    if item.price_type == "person":
        quantity = max(item.min_order, guest_count)
        return quantity, ("quantity from guest count",)

    requested = piece_quantity_by_item_id.get(item.id)
    if requested is None:
        return item.min_order, ("quantity uses catalog minimum fallback",)

    quantity = max(item.min_order, requested)
    explanations = ["quantity from explicit piece demand"]
    if quantity != requested:
        explanations.append("catalog minimum applied")
    return quantity, tuple(explanations)
