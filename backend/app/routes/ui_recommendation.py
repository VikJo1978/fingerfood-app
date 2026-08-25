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
from app.models.item import CateringFormat, RecommendationEventType
from app.routes.offer import safe_error_detail
from app.services.catalog_client import CatalogClientError
from app.services.catalog_factory import (
    build_catalog_adapter,
    build_core_customer_history_client,
    build_core_customer_preference_client,
    build_core_office_client,
)
from app.services.core_capacity_signal_adapter import (
    CoreCapacityRow,
    capacity_signals_from_core_rows,
)
from app.services.core_customer_history_adapter import (
    CustomerHistorySignal,
    customer_history_signals_from_core_orders,
)
from app.services.core_customer_history_client import CoreCustomerHistoryClientError
from app.services.core_customer_preference_adapter import (
    CustomerPreferenceSignal,
    customer_preference_signals_from_core_preferences,
)
from app.services.core_customer_preference_client import CoreCustomerPreferenceClientError
from app.services.core_office_client import CoreOfficeClientError
from app.services.core_production_signal_adapter import production_signals_from_core_rows
from app.services.recommendation_engine import RecommendationRequest
from app.services.recommendation_service import generate_recommendation_variants

router = APIRouter(prefix="/api/ui/recommendations", tags=["ui-recommendations"])

_CAPACITY_TIER_LABELS = {
    "CAPACITY_ELEVATED": "Erhöhte Auslastung",
    "CAPACITY_HIGH": "Hohe Auslastung",
    "CAPACITY_NEAR_LIMIT": "Auslastung nahe am empfohlenen Grenzwert",
    "CAPACITY_EXCEEDED": "Empfohlener Kapazitätsgrenzwert überschritten",
}
_CAPACITY_TIER_PRIORITY = (
    "CAPACITY_EXCEEDED",
    "CAPACITY_NEAR_LIMIT",
    "CAPACITY_HIGH",
    "CAPACITY_ELEVATED",
)
_CAPACITY_CONFIGURATION_LABELS = {
    "MISSING_STATION_REQUIREMENT": "Kapazitätszuordnung fehlt",
    "STATION_INACTIVE": "Produktionsstation ist inaktiv",
    "CAPACITY_UNSET": "Kapazität ist nicht hinterlegt",
    "STATION_UNAVAILABLE": "Produktionsstation ist nicht verfügbar",
    "NO_CAPACITY": "Für die Produktionsstation ist keine Kapazität hinterlegt",
    "DEMAND_SOURCE_INCOMPLETE": (
        "Auslastung kann wegen unvollständiger Auftragsdaten nicht vollständig "
        "berechnet werden"
    ),
}
_CAPACITY_SOURCE_UNAVAILABLE_WARNING = (
    "Produktionshinweis: Kapazitätsdaten sind derzeit nicht verfügbar. "
    "Empfehlungen und Angebot bleiben verfügbar; die Entscheidung trifft der "
    "Mitarbeiter."
)
_HISTORY_SOURCE_UNAVAILABLE_WARNING = (
    "Kundenhistorie ist derzeit nicht verfügbar. Die Vorschläge bleiben verfügbar "
    "und werden ohne Historienhinweise berechnet."
)
_PREFERENCE_SOURCE_UNAVAILABLE_WARNING = (
    "Gespeicherte Kundenpräferenzen sind derzeit nicht verfügbar. Die Vorschläge "
    "bleiben verfügbar und werden ohne diese Präferenzsignale berechnet."
)


class UiRecommendationGenerateRequest(BaseModel):
    """Structured Office questionnaire inputs used by deterministic v1 scoring."""

    event_date: date
    guest_count: int = Field(gt=0)
    inquiry_id: str | None = None
    use_customer_history: bool = True
    event_type: RecommendationEventType | None = None
    catering_format: CateringFormat | None = None
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


def _capacity_tier_from_percent(load_percent: int) -> str | None:
    if load_percent >= 100:
        return "CAPACITY_EXCEEDED"
    if load_percent >= 90:
        return "CAPACITY_NEAR_LIMIT"
    if load_percent >= 80:
        return "CAPACITY_HIGH"
    if load_percent >= 70:
        return "CAPACITY_ELEVATED"
    return None


def _capacity_warnings(rows: tuple[CoreCapacityRow, ...]) -> tuple[str, ...]:
    """Turn Core capacity facts into visible, non-blocking employee guidance."""

    if not rows:
        return ()

    reasons = {row.reason_code for row in rows if row.reason_code is not None}
    current_load_percent = max(row.overload_penalty for row in rows)
    warnings: list[str] = []

    tier_reason = next(
        (reason for reason in _CAPACITY_TIER_PRIORITY if reason in reasons),
        None,
    )
    if tier_reason is None and not reasons:
        tier_reason = _capacity_tier_from_percent(current_load_percent)

    if tier_reason is not None:
        label = _CAPACITY_TIER_LABELS[tier_reason]
        load_text = (
            "mindestens 100 %"
            if tier_reason == "CAPACITY_EXCEEDED"
            else f"ca. {current_load_percent} %"
        )
        warnings.append(
            f"Produktionshinweis: {label}. Die aktuelle Tagesauslastung liegt bei "
            f"{load_text}. Empfehlungen und Angebot bleiben verfügbar; die "
            "Entscheidung trifft der Mitarbeiter."
        )

    configuration_labels = sorted(
        {
            _CAPACITY_CONFIGURATION_LABELS[reason]
            for reason in reasons
            if reason in _CAPACITY_CONFIGURATION_LABELS
        }
    )
    if configuration_labels:
        warnings.append(
            "Produktionshinweis: Die Kapazität kann nicht vollständig bewertet "
            f"werden ({'; '.join(configuration_labels)}). Das blockiert die "
            "Bearbeitung nicht; die Entscheidung trifft der Mitarbeiter."
        )

    return tuple(warnings)


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
    except CoreOfficeClientError as exc:
        raise HTTPException(
            status_code=503,
            detail=safe_error_detail(
                "recommendation_demand_unavailable",
                "Same-day production demand is unavailable.",
            ),
        ) from exc

    capacity_source_warnings: tuple[str, ...] = ()
    try:
        core_capacity_rows = core.get_recommendation_capacity(payload.event_date)
    except CoreOfficeClientError:
        core_capacity_rows = ()
        capacity_source_warnings = (_CAPACITY_SOURCE_UNAVAILABLE_WARNING,)

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

    customer_id: str | None = None
    identity_source_failed = False
    if payload.inquiry_id:
        try:
            inquiry = core.get_inquiry(payload.inquiry_id)
            raw_customer_id = inquiry.get("customer_id") if inquiry is not None else None
            if isinstance(raw_customer_id, str) and raw_customer_id:
                customer_id = raw_customer_id
        except CoreOfficeClientError:
            identity_source_failed = True

    customer_history_signals: tuple[CustomerHistorySignal, ...] = ()
    history_source_warnings: tuple[str, ...] = ()
    if payload.use_customer_history and payload.inquiry_id:
        if identity_source_failed:
            history_source_warnings = (_HISTORY_SOURCE_UNAVAILABLE_WARNING,)
        elif customer_id is not None:
            try:
                history_orders = build_core_customer_history_client().list_for_customer(
                    customer_id
                )
                customer_history_signals = customer_history_signals_from_core_orders(
                    history_orders,
                    as_of=payload.event_date,
                    configurator_item_ids=configurator_item_ids,
                )
            except CoreCustomerHistoryClientError:
                history_source_warnings = (_HISTORY_SOURCE_UNAVAILABLE_WARNING,)

    customer_preference_signals: tuple[CustomerPreferenceSignal, ...] = ()
    preference_source_warnings: tuple[str, ...] = ()
    if payload.inquiry_id:
        if identity_source_failed:
            preference_source_warnings = (_PREFERENCE_SOURCE_UNAVAILABLE_WARNING,)
        elif customer_id is not None:
            try:
                preferences = build_core_customer_preference_client().list_for_customer(
                    customer_id
                )
                customer_preference_signals = (
                    customer_preference_signals_from_core_preferences(
                        preferences,
                        catalog_items=tuple(items),
                    )
                )
            except CoreCustomerPreferenceClientError:
                preference_source_warnings = (_PREFERENCE_SOURCE_UNAVAILABLE_WARNING,)

    recommendation_request = RecommendationRequest(
        catering_format=payload.catering_format,
        event_type=payload.event_type,
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
        customer_history_signals=customer_history_signals,
        customer_preference_signals=customer_preference_signals,
        max_variant_net_cents=payload.max_variant_net_cents,
        piece_quantity_by_item_id=payload.piece_quantity_by_item_id,
    )

    warnings = [
        *catalog.warnings,
        *capacity_source_warnings,
        *history_source_warnings,
        *preference_source_warnings,
        *_capacity_warnings(core_capacity_rows),
    ]
    return {
        "event_date": payload.event_date.isoformat(),
        "guest_count": payload.guest_count,
        "catalog_revision": catalog.catalog_revision,
        "catalog_source": catalog.source,
        "warnings": warnings,
        "production_signal_count": len(production_signals),
        "capacity_signal_count": len(capacity_signals),
        "customer_history_signal_count": len(customer_history_signals),
        "customer_preference_signal_count": len(customer_preference_signals),
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
