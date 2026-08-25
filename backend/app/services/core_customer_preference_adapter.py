"""Adapt explicit Core gastronomic preferences into catalog recommendation signals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.models.item import Item

PreferenceSignalKind = Literal["favorite_dish", "disliked_dish"]


@dataclass(frozen=True)
class CoreCustomerPreference:
    kind: str
    value: str
    source: str


@dataclass(frozen=True)
class CustomerPreferenceSignal:
    item_id: str
    kind: PreferenceSignalKind
    source: str
    explanation: str


def customer_preference_signals_from_core_preferences(
    preferences: tuple[CoreCustomerPreference, ...],
    *,
    catalog_items: tuple[Item, ...],
) -> tuple[CustomerPreferenceSignal, ...]:
    """Resolve only explicit dish preferences with an exact unique catalog name.

    Free-form preference text is deliberately not fuzzy matched. Ambiguous or stale
    names stay visible as customer data in Core but do not become structured product
    facts in recommendation scoring.
    """

    item_ids_by_name: dict[str, list[str]] = {}
    for item in catalog_items:
        normalized = _normalize_name(item.name)
        if normalized:
            item_ids_by_name.setdefault(normalized, []).append(item.id)

    signals: list[CustomerPreferenceSignal] = []
    for preference in preferences:
        if preference.kind not in {"favorite_dish", "disliked_dish"}:
            continue
        normalized = _normalize_name(preference.value)
        matches = item_ids_by_name.get(normalized, [])
        if len(matches) != 1:
            continue
        kind: PreferenceSignalKind = (
            "favorite_dish"
            if preference.kind == "favorite_dish"
            else "disliked_dish"
        )
        signals.append(
            CustomerPreferenceSignal(
                item_id=matches[0],
                kind=kind,
                source=preference.source,
                explanation=(
                    "explicit customer preference: "
                    f"{preference.kind} ({preference.source})"
                ),
            )
        )

    return tuple(sorted(signals, key=lambda signal: (signal.item_id, signal.kind)))


def _normalize_name(value: str) -> str:
    return " ".join(value.split()).casefold()
