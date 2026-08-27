from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import require_fingerfood_api_token
from app.models.offer import OfferRequest
from app.services.catalog_factory import (
    build_catalog_adapter,
    build_core_office_client,
)
from app.services.core_office_client import CoreOfficeClientError
from app.services.offer_snapshot_service import build_offer_snapshot_v2
from app.services.pricing_service import price_offer

router = APIRouter(prefix="/api/offer", tags=["offer"])


def safe_error_detail(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _snapshot_build_error_code(exc: ValueError) -> str:
    if str(exc).startswith("unknown catalog positions:"):
        return "stale_catalog_positions"
    return "invalid_offer_snapshot"


class OfferSnapshotBuildRequest(BaseModel):
    inquiry_id: str
    snapshot_id: str
    valid_until: date
    recipient: dict[str, str]
    event: dict[str, object]
    customer_text: dict[str, str]
    payment_terms: dict[str, str]
    offer: OfferRequest
    source_draft_id: str | None = None
    # OFFER_BUDGET_DEFINITION_V1: optional, internal-only operator planning
    # metadata — forwarded to Core as-is when present, omitted entirely
    # when the operator never enabled budget tracking. Deep validation
    # (enum values, cents) happens on the Core side; this is purely a
    # pass-through shape here.
    budget_definition: dict[str, object] | None = None
    # CONFIGURABLE_OFFER_CHARGES_V1: optional, customer-facing delivery/
    # dishware/buffet charge definition. Kept as a raw dict at this route
    # boundary (rather than a nested pydantic field) so the strict
    # ChargesDefinitionIn validation in offer_snapshot_service.py stays the
    # single source of truth shared by both /snapshot and /prepare, instead
    # of duplicating it here. Omitted entirely means the legacy hardcoded
    # Büffetpauschale/Geschirrpauschale/Anlieferung path (see
    # offer_snapshot_service.build_offer_snapshot_v2 for the exact
    # compatibility rule) — this is what the currently deployed frontend
    # still sends.
    charges_definition: dict[str, object] | None = None


def _build_snapshot_payload(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    adapter = build_catalog_adapter()
    return build_offer_snapshot_v2(
        adapter=adapter,
        inquiry_id=body.inquiry_id,
        snapshot_id=body.snapshot_id,
        valid_until=body.valid_until,
        recipient=body.recipient,
        event=body.event,
        customer_text=body.customer_text,
        payment_terms=body.payment_terms,
        offer=body.offer,
        source_draft_id=body.source_draft_id,
        budget_definition=body.budget_definition,
        charges_definition=body.charges_definition,
        catalog_revision=adapter.load_items_for_compose().catalog_revision,
    )


def execute_prepare_offer(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    core = build_core_office_client()
    if not core.is_configured():
        raise HTTPException(
            status_code=503,
            detail=safe_error_detail(
                "core_office_not_configured",
                "Core Office API is not configured.",
            ),
        )
    try:
        snapshot = _build_snapshot_payload(body)
        result = core.prepare_offer(body.inquiry_id, snapshot)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=safe_error_detail(
                _snapshot_build_error_code(exc),
                "Offer snapshot is invalid.",
            ),
        ) from exc
    except CoreOfficeClientError as exc:
        raise HTTPException(
            status_code=502,
            detail=safe_error_detail(
                "core_offer_prepare_failed",
                "Core offer preparation failed.",
            ),
        ) from exc
    response: dict[str, object] = {
        "offer_id": result["offer_id"],
        "schema_version": snapshot["schema_version"],
        "existing_offer": result.get("existing_offer", False),
    }
    if "offer_version_id" in result:
        response["offer_version_id"] = result["offer_version_id"]
    if "snapshot_id" in result:
        response["snapshot_id"] = result["snapshot_id"]
    return response


@router.post("/calculate")
def calculate_offer(body: OfferRequest):
    adapter = build_catalog_adapter()
    loaded = adapter.load_items_for_compose()
    return price_offer(
        loaded.items,
        body,
        unit_net_cents_by_item_id=loaded.unit_net_cents_by_item_id,
    )


@router.post("/snapshot", dependencies=[Depends(require_fingerfood_api_token)])
def build_snapshot(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    """Protected: materializes a commercial OfferSnapshot V2 payload."""
    try:
        return _build_snapshot_payload(body)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=safe_error_detail(
                _snapshot_build_error_code(exc),
                "Offer snapshot is invalid.",
            ),
        ) from exc


@router.post("/prepare", dependencies=[Depends(require_fingerfood_api_token)])
def prepare_offer(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    return execute_prepare_offer(body)
