"""Browser-facing deterministic recommendation generation for issue #151."""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.csrf import validate_csrf
from app.core.employee_auth import (
    require_authenticated_employee,
    require_employee_permission,
)
from app.models.classification import Allergen, DietType
from app.routes.offer import safe_error_detail
from app.services.catalog_client import CatalogClientError
from app.services.catalog_factory import build_catalog_adapter, build_core_office_client
from app.services.core_capacity_signal_adapter import capacity_signals_from_core_rows
from app.services.core_office_client import CoreOfficeClientError
from app.services.core_production_signal_adapter import production_signals_from_core_rows
from app.services.recommendation_engine import RecommendationRequest
from app.services.recommendation_service import generate_recommendation_variants

router = APIRouter(prefix="/api/ui/recommendations", tags=["ui-recommendations"])


class UiRecommendationGenerateRequest(BaseModel):
    """Structured Office questionnaire inputs used by deterministic v1 scoring."""

    event_date: date
    guest_count: int = Field(gt=0)
    event_type: str | None = None
    catering_format: Literal["fingerfood", "buffet", "mixed", "other"] | None = None
    fulfillment_mode: Literal["PICKUP", "DELIVERY"]
    diet_type: DietType | None = None
    excluded_allergens: set[Allergen] = Field(default_factory=set)
    no_pork: bool = False
    preferred_categories: set[str] = Field(default_factory=set)
    disliked_item_ids: set[str] = Field(default_factory=set)
    must_have_item_ids: set[str] = Field(default_factory=set)
    max_unit_net_cents: int | None = Field(default=None, ge=0)
    max_variant_net_cents: int | None = Field(default=None, ge=0)
    piece_quantity_by_item_id: dict[str, int] = Field(default_factory=dict)


@router.post("/generate")
def generate_ui_recommendations(
    payload: UiRecommendationGenerateRequest,
    request: Request,
) -> dict[str, object]:
    """Generate explainable variants from questionnaire + current Core signals."""

    principal = require_authenticated_employee(request)
    require_employee_permission(principal, "offers.prepare")
    validate_csrf(request)

    catalog_adapter = build_catalog_adapter()
    try:
        catalog = catalog_adapter.load_items_for_compose()
    except CatalogClientError as exc:
        raise HTTPException(
            status_code=503,
            detail=safe_error_detail(
                "recommendation_catalog_unavailable",
                "Catalog data for recommendation generation is unavailable.",
            ),
        ) from exc

    core = build_core_office_client()
    try:
        core_rows = core.get_recommendation_demand(payload.event_date)
        core_capacity_rows = core.get_recommendation_capacity(payload.event_date)
    except CoreOfficeClientError as exc:
        code = (
            "recommendation_capacity_unavailable"
            if exc.code.startswith("recommendation_capacity")
            else "recommendation_demand_unavailable"
        )
        message = (
            "Production capacity is unavailable."
            if code == "recommendation_capacity_unavailable"
            else "Same-day production demand is unavailable."
        )
        raise HTTPException(
            status_code=503,
            detail=safe_error_detail(code, message),
        ) from exc

    items = list(catalog.items.values())
    configurator_item_ids = tuple(catalog.items.keys())
    production_signals = production_signals_from_core_rows(
        core_rows,
        configurator_item_ids=configurator_item_ids,
    )
    capacity_signals = capacity_signals_from_core_rows(
        core_capacity_rows,
        configurator_item_ids=configurator_item_ids,
    )
    recommendation_request = RecommendationRequest(
        diet_type=payload.diet_type,
        excluded_allergens=frozenset(payload.excluded_allergens),
        no_pork=payload.no_pork,
        preferred_categories=frozenset(payload.preferred_categories),
        disliked_item_ids=frozenset(payload.disliked_item_ids),
        must_have_item_ids=frozenset(payload.must_have_item_ids),
        max_unit_net_cents=payload.max_unit_net_cents,
    )
    variants = generate_recommendation_variants(
        items,
        catalog.unit_net_cents_by_item_id,
        recommendation_request,
        guest_count=payload.guest_count,
        production_signals=production_signals,
        capacity_signals=capacity_signals,
        max_variant_net_cents=payload.max_variant_net_cents,
        piece_quantity_by_item_id=payload.piece_quantity_by_item_id,
    )

    return {
        "event_date": payload.event_date.isoformat(),
        "guest_count": payload.guest_count,
        "catalog_revision": catalog.catalog_revision,
        "catalog_source": catalog.source,
        "warnings": list(catalog.warnings),
        "production_signal_count": len(production_signals),
        "capacity_signal_count": len(capacity_signals),
        "variants": [
            {
                "kind": variant.kind,
                "label": variant.label,
                "net_total_cents": variant.net_total_cents,
                "explanations": list(variant.explanations),
                "lines": [
                    {
                        "item_id": line.item_id,
                        "quantity": line.quantity,
                        "unit_net_cents": line.unit_net_cents,
                        "net_total_cents": line.net_total_cents,
                        "score": line.score,
                        "explanations": list(line.explanations),
                    }
                    for line in variant.lines
                ],
            }
            for variant in variants
        ],
    }
