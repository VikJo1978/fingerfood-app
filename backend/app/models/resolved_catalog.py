"""Resolved catalog line for pricing and OfferSnapshot V2 positions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.models.item import Item


@dataclass(frozen=True)
class ResolvedCatalogLine:
    """One selectable catalog row after Catalog vs items.json resolution."""

    line_id: str
    catalog_item_id: str | None
    item: Item
    unit_net_cents: int
    allergens: tuple[str, ...]
    description: str | None
    composition: str | None
    notes: str | None
    source: Literal["catalog", "items_json"]
    vegan: None = None
    vegetarian: None = None
