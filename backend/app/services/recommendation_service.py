"""High-level deterministic recommendation orchestration for issue #151."""

from __future__ import annotations

from dataclasses import replace

from app.models.item import Item
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
    production_signals: tuple[ProductionSignal, ...] = (),
    capacity_signals: tuple[CapacitySignal, ...] = (),
    max_variant_net_cents: int | None = None,
) -> tuple[RecommendationVariant, ...]:
    """Generate Wirtschaftlich, Empfohlen and Premium from independent rankings.

    Every profile gets its own scoring pass over the same hard constraints and
    operational signals. This prevents one profile's ordering from leaking into
    the other variants while keeping the result deterministic and explainable.
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
        )
        variant = assemble_variant(
            profile,
            items,
            ranked,
            unit_net_cents_by_item_id,
            guest_count=guest_count,
            max_variant_net_cents=max_variant_net_cents,
        )
        if variant is not None:
            variants.append(variant)
    return tuple(variants)
