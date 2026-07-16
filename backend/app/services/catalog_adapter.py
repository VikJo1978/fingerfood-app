"""Catalog adapter — Catalog API for selection, items.json fallback."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from app.core.config import settings
from app.models.catalog_dish import CoreCatalogDishSummary
from app.models.item import Item
from app.models.resolved_catalog import ResolvedCatalogLine
from app.services.catalog_allergens import eu_allergen_codes_from_configurator
from app.services.catalog_client import CatalogClient, CatalogClientError
from app.services.catalog_ids import dish_id_from_source_id
from app.services.item_service import load_items
from app.services.pricing_math import cents_to_float, euros_to_cents

_log = logging.getLogger(__name__)

CatalogSource = Literal["catalog", "items_json", "mixed"]


@dataclass(frozen=True)
class CatalogAdapterLoadResult:
    items: dict[str, Item]
    unit_net_cents_by_item_id: dict[str, int]
    source: CatalogSource
    catalog_revision: str
    warnings: tuple[str, ...]


class CatalogAdapter:
    """Read Catalog for compose; never mutates Core Stammdaten."""

    def __init__(
        self,
        catalog_client: CatalogClient,
        *,
        items_path=None,
        strict: bool | None = None,
    ) -> None:
        self._client = catalog_client
        self._items_path = items_path or settings.items_json_path
        self._strict = settings.catalog_adapter_strict if strict is None else strict
        self._items_json_by_id: dict[str, Item] | None = None
        self._items_json_by_dish_id: dict[str, Item] | None = None

    def load_items_for_compose(self) -> CatalogAdapterLoadResult:
        """Items map for pricing/UI — Catalog prices when API reachable."""
        json_items = self._items_json_map()
        if not self._client.is_configured():
            return CatalogAdapterLoadResult(
                items=json_items,
                unit_net_cents_by_item_id=self._legacy_prices(json_items),
                source="items_json",
                catalog_revision="items-json-local",
                warnings=("catalog client not configured",),
            )
        try:
            dishes = self._client.list_dishes(active_only=True)
        except CatalogClientError as exc:
            _log.warning("catalog list failed, using items.json fallback: %s", exc)
            if self._strict:
                raise
            return CatalogAdapterLoadResult(
                items=json_items,
                unit_net_cents_by_item_id=self._legacy_prices(json_items),
                source="items_json",
                catalog_revision="items-json-fallback",
                warnings=(f"catalog unavailable: {exc}",),
            )

        merged, prices, warnings = self._merge_catalog_with_items_json(
            dishes, json_items
        )
        source: CatalogSource = "catalog" if not warnings else "mixed"
        revision = self._catalog_revision(dishes)
        if warnings:
            _log.warning("catalog adapter warnings: %s", "; ".join(warnings))
        return CatalogAdapterLoadResult(
            items=merged,
            unit_net_cents_by_item_id=prices,
            source=source,
            catalog_revision=revision,
            warnings=tuple(warnings),
        )

    def resolve_line(self, item_id: str) -> ResolvedCatalogLine | None:
        """Resolve one offer line to snapshot facts."""
        json_items = self._items_json_map()
        json_item = json_items.get(item_id)
        dish_id = dish_id_from_source_id(item_id)

        if self._client.is_configured():
            try:
                detail = self._client.get_dish(dish_id)
                if detail is not None and detail.active:
                    template = json_item or json_items.get(dish_id)
                    return self._resolved_from_catalog(
                        line_id=item_id,
                        dish=detail,
                        template=template,
                    )
            except CatalogClientError as exc:
                _log.warning(
                    "catalog detail failed for %s, fallback items.json: %s",
                    item_id,
                    exc,
                )
                if self._strict:
                    raise

        if json_item is None:
            return None
        return self._resolved_from_items_json(item_id, json_item)

    def _merge_catalog_with_items_json(
        self,
        dishes: list[CoreCatalogDishSummary],
        json_items: dict[str, Item],
    ) -> tuple[dict[str, Item], dict[str, int], list[str]]:
        by_dish_id = self._items_json_by_dish_id_map(json_items)
        merged: dict[str, Item] = {}
        prices: dict[str, int] = {}
        warnings: list[str] = []
        for dish in dishes:
            if not dish.active:
                continue
            template = by_dish_id.get(dish.dish_id)
            if template is None:
                warnings.append(
                    f"catalog dish {dish.dish_id!r} has no items.json template"
                )
                continue
            merged[template.id] = template.model_copy(
                update={"price": cents_to_float(dish.current_unit_net_cents)}
            )
            prices[template.id] = dish.current_unit_net_cents
        if not merged and dishes:
            warnings.append("catalog returned dishes but none matched items.json ids")
            if self._strict:
                return {}, {}, warnings
            return (
                json_items,
                self._legacy_prices(json_items),
                [*warnings, "using items.json because catalog merge empty"],
            )
        if not merged:
            return json_items, self._legacy_prices(json_items), warnings
        return merged, prices, warnings

    def _resolved_from_catalog(
        self,
        *,
        line_id: str,
        dish: CoreCatalogDishSummary,
        template: Item | None,
    ) -> ResolvedCatalogLine:
        if template is None:
            raise CatalogClientError(
                f"catalog dish {dish.dish_id!r} missing items.json template"
            )
        item = template.model_copy(
            update={"price": cents_to_float(dish.current_unit_net_cents)}
        )
        return ResolvedCatalogLine(
            line_id=line_id,
            catalog_item_id=dish.dish_id,
            item=item,
            unit_net_cents=dish.current_unit_net_cents,
            allergens=tuple(sorted(set(dish.allergens))),
            description=getattr(dish, "description", None)
            or template.description
            or None,
            composition=getattr(dish, "composition", None) or template.items_included,
            notes=getattr(dish, "notes", None),
            source="catalog",
        )

    def _resolved_from_items_json(
        self, line_id: str, item: Item
    ) -> ResolvedCatalogLine:
        cents = euros_to_cents(item.price)
        return ResolvedCatalogLine(
            line_id=line_id,
            catalog_item_id=dish_id_from_source_id(line_id),
            item=item,
            unit_net_cents=cents,
            allergens=tuple(eu_allergen_codes_from_configurator(item.allergens)),
            description=item.description or None,
            composition=item.items_included,
            notes=None,
            source="items_json",
        )

    @staticmethod
    def _legacy_prices(items: dict[str, Item]) -> dict[str, int]:
        return {item_id: euros_to_cents(item.price) for item_id, item in items.items()}

    def _items_json_map(self) -> dict[str, Item]:
        if self._items_json_by_id is None:
            items = load_items(self._items_path)
            self._items_json_by_id = {item.id: item for item in items}
        return self._items_json_by_id

    def _items_json_by_dish_id_map(
        self, json_items: dict[str, Item]
    ) -> dict[str, Item]:
        if self._items_json_by_dish_id is None:
            self._items_json_by_dish_id = {
                dish_id_from_source_id(item.id): item for item in json_items.values()
            }
        return self._items_json_by_dish_id

    @staticmethod
    def _catalog_revision(dishes: list[CoreCatalogDishSummary]) -> str:
        if not dishes:
            return "core-catalog-v1-empty"
        return "core-catalog-v1"
