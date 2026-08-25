"""Adapt factual Core customer order history into soft recommendation signals."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

HistorySignalKind = Literal["frequently_ordered", "recently_ordered"]


@dataclass(frozen=True)
class CoreCustomerHistoryDish:
    item_id: str
    name: str


@dataclass(frozen=True)
class CoreCustomerHistoryOrder:
    order_id: str
    event_date: date
    cancelled: bool
    dishes: tuple[CoreCustomerHistoryDish, ...]


@dataclass(frozen=True)
class CustomerHistorySignal:
    item_id: str
    kind: HistorySignalKind
    order_count: int
    last_ordered_on: date
    explanation: str


FREQUENT_MIN_ORDERS = 2
RECENT_WINDOW_DAYS = 90


def customer_history_signals_from_core_orders(
    orders: tuple[CoreCustomerHistoryOrder, ...],
    *,
    as_of: date,
    configurator_item_ids: tuple[str, ...],
) -> tuple[CustomerHistorySignal, ...]:
    """Derive non-blocking history hints from factual accepted-order history."""

    allowed = set(configurator_item_ids)
    by_item: dict[str, list[CoreCustomerHistoryOrder]] = {}
    for order in orders:
        if order.cancelled:
            continue
        seen: set[str] = set()
        for dish in order.dishes:
            if dish.item_id not in allowed or dish.item_id in seen:
                continue
            seen.add(dish.item_id)
            by_item.setdefault(dish.item_id, []).append(order)

    signals: list[CustomerHistorySignal] = []
    for item_id, occurrences in by_item.items():
        occurrences.sort(key=lambda row: (row.event_date, row.order_id), reverse=True)
        latest = occurrences[0]
        order_count = len(occurrences)
        if order_count >= FREQUENT_MIN_ORDERS:
            signals.append(
                CustomerHistorySignal(
                    item_id=item_id,
                    kind="frequently_ordered",
                    order_count=order_count,
                    last_ordered_on=latest.event_date,
                    explanation=(
                        f"customer history: ordered in {order_count} previous orders"
                    ),
                )
            )
        age_days = (as_of - latest.event_date).days
        if 0 <= age_days <= RECENT_WINDOW_DAYS:
            signals.append(
                CustomerHistorySignal(
                    item_id=item_id,
                    kind="recently_ordered",
                    order_count=order_count,
                    last_ordered_on=latest.event_date,
                    explanation=(
                        f"customer history: last ordered {age_days} day(s) ago"
                    ),
                )
            )
    return tuple(
        sorted(signals, key=lambda signal: (signal.item_id, signal.kind, signal.last_ordered_on))
    )
