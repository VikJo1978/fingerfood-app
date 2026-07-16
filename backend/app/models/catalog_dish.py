"""Core Catalog API wire shapes (read-only)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CoreCatalogDishSummary(BaseModel):
    dish_id: str
    name: str
    current_unit_net_cents: int = Field(ge=0)
    price_display: str
    allergens: list[str] = Field(default_factory=list)
    allergen_labels: list[str] = Field(default_factory=list)
    active: bool


class CoreCatalogDishDetail(CoreCatalogDishSummary):
    description: str | None = None
    composition: str | None = None
    notes: str | None = None
    created_at: str
    updated_at: str
