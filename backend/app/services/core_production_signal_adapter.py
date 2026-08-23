"""Translate normalized Core same-day demand rows into recommendation signals.

Core exposes canonical Catalog ``catalog_item_id`` values, while the configurator
scores its local/source ``Item.id`` values. This adapter keeps that identity
translation explicit so production overlap can actually reach the ranked item
instead of quietly disappearing behind two different ids.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.services.catalog_ids import dish_id_from_source_id
from app.services.recommendation_engine import ProductionConfidence, ProductionSignal

CoreDemandState = Literal[
    "CONFIRMED_ORDER",
    "ACCEPTED_ORDER",
    "SENT_OFFER",
    "REJECTED",
    "CANCELLED",
]


@dataclass(frozen=True)
class CoreSameDayDemandRow:
    item_id: str
    state: CoreDemandState


_CONFIDENCE_BY_STATE: dict[CoreDemandState, ProductionConfidence] = {
    "CONFIRMED_ORDER": "CONFIRMED",
    "ACCEPTED_ORDER": "LIKELY",
    "SENT_OFFER": "OPEN_OFFER",
}


def production_signals_from_core_rows(
    rows: tuple[CoreSameDayDemandRow, ...],
    *,
    configurator_item_ids: tuple[str, ...] | None = None,
) -> tuple[ProductionSignal, ...]:
    """Return one strongest signal per configurator item.

    ``rows`` carry Core Catalog ids. When ``configurator_item_ids`` is supplied,
    those ids are deterministically reversed to the local/source item ids used by
    the recommendation engine. Unknown Core ids are ignored rather than creating
    signals that can never match a catalog candidate.

    The optional argument keeps the small adapter backwards compatible for direct
    callers that already provide recommendation-engine item ids.
    """

    source_id_by_catalog_id = (
        {
            dish_id_from_source_id(item_id): item_id
            for item_id in configurator_item_ids
        }
        if configurator_item_ids is not None
        else None
    )
    strength: dict[ProductionConfidence, int] = {
        "OPEN_OFFER": 1,
        "LIKELY": 2,
        "CONFIRMED": 3,
    }
    strongest: dict[str, ProductionSignal] = {}
    for row in rows:
        confidence = _CONFIDENCE_BY_STATE.get(row.state)
        if confidence is None:
            continue
        item_id = row.item_id
        if source_id_by_catalog_id is not None:
            mapped = source_id_by_catalog_id.get(row.item_id)
            if mapped is None:
                continue
            item_id = mapped
        candidate = ProductionSignal(item_id, confidence)
        current = strongest.get(item_id)
        if current is None or strength[candidate.confidence] > strength[current.confidence]:
            strongest[item_id] = candidate
    return tuple(strongest[item_id] for item_id in sorted(strongest))
