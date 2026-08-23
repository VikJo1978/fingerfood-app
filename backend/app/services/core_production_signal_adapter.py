"""Translate normalized Core same-day demand rows into recommendation signals.

The adapter keeps Core lifecycle vocabulary out of the scoring engine. The eventual
HTTP/read-model client only needs to provide rows in this small contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

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
) -> tuple[ProductionSignal, ...]:
    """Return one strongest signal per item, ignoring rejected/cancelled demand."""

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
        candidate = ProductionSignal(row.item_id, confidence)
        current = strongest.get(row.item_id)
        if current is None or strength[candidate.confidence] > strength[current.confidence]:
            strongest[row.item_id] = candidate
    return tuple(strongest[item_id] for item_id in sorted(strongest))
