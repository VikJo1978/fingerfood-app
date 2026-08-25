"""High-level deterministic recommendation orchestration for issue #151."""

from __future__ import annotations

from dataclasses import replace

from app.models.item import Item
from app.services.core_customer_history_adapter import CustomerHistorySignal
from app.services.recommendation_engine import (
    CapacitySignal,
    ProductionSignal,
    RecommendationProfile,
    RecommendationRequest,
    rank_items,
)
from app.services.recommendation_variant_assembler import (
    RecommendationVariant,
    assemble_variant,
)

_PROFILES: tuple[RecommendationProfile, ...] = (
    "ECONOMIC",
    "RECOMMENDED",
    "PREMIUM",
)


def generate_recommendation_variants(
    items: list[Item],
    unit_net_cents_by_item_id: dict[str, int],
    request: RecommendationRequest,
    *,
    guest_count: int,
    piece_quantity_by_item_id: dict[str, int] | None = None,
    production_signals: tuple[ProductionSignal, ...] = (),
    capacity_signals: tuple[CapacitySignal, ...] = (),
    customer_history_signals: tuple[CustomerHistorySignal, ...] = (),
    max_variant_net_cents: int | None = None,
) -> tuple[RecommendationVariant, ...]:
    """Generate Wirtschaftlich, Empfohlen and Premium from independent rankings.

    Every profile gets its own scoring pass over the same hard constraints and
    advisory operational/customer-history signals. Piece-priced positions may
    receive explicit demand so variant totals reflect intended quantities instead
    of pretending that the catalog minimum is a serving recommendation.
    """

    variants: list[RecommendationVariant] = []
    for profile in _PROFILES:
        profile_request = replace(request, profile=profile)
        ranked = rank_items(
            items,
            unit_net_cents_by_item_id,
            profile_request,
            production_signals=production_signals,
            capacity_signals=capacity_signals,
            customer_history_signals=customer_history_signals,
        )
        variant = assemble_variant(
            profile,
            items,
            ranked,
            unit_net_cents_by_item_id,
            guest_count=guest_count,
            piece_quantity_by_item_id=piece_quantity_by_item_id,
            max_variant_net_cents=max_variant_net_cents,
        )
        if variant is not None:
            variants.append(variant)
    return tuple(variants)
