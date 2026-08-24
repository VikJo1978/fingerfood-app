"""Translate Core recommendation-capacity rows into configurator capacity signals.

The adapter deliberately carries only the item-level feasibility and pressure
facts exposed by Core; quantity-aware capacity remains outside this v1 contract.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.catalog_ids import dish_id_from_source_id
from app.services.recommendation_engine import CapacitySignal


@dataclass(frozen=True)
class CoreCapacityRow:
    item_id: str
    feasible: bool
    overload_penalty: int
    reason_code: str | None = None


def capacity_signals_from_core_rows(
    rows: tuple[CoreCapacityRow, ...],
    *,
    configurator_item_ids: tuple[str, ...],
) -> tuple[CapacitySignal, ...]:
    """Map canonical Core catalog ids back to local configurator item ids.

    Unknown Core ids are ignored. Invalid values are rejected earlier by the
    Core Office client so this adapter only performs deterministic identity mapping.
    """

    source_id_by_catalog_id = {
        dish_id_from_source_id(item_id): item_id for item_id in configurator_item_ids
    }
    signals: list[CapacitySignal] = []
    for row in rows:
        item_id = source_id_by_catalog_id.get(row.item_id)
        if item_id is None:
            continue
        signals.append(
            CapacitySignal(
                item_id=item_id,
                feasible=row.feasible,
                overload_penalty=row.overload_penalty,
            )
        )
    return tuple(sorted(signals, key=lambda signal: signal.item_id))
