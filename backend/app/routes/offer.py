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
        catalog_revision=adapter.load_items_for_compose().catalog_revision,
    )


def execute_prepare_offer(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    core = build_core_office_client()
    if not core.is_configured():
        raise HTTPException(
            status_code=503,
            detail="CORE_OFFICE_API_URL and CORE_OFFICE_API_TOKEN required",
        )
    try:
        snapshot = _build_snapshot_payload(body)
        result = core.prepare_offer(body.inquiry_id, snapshot)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CoreOfficeClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "offer_id": result["offer_id"],
        "offer_version_id": result["offer_version_id"],
        "snapshot_id": result.get("snapshot_id", body.snapshot_id),
        "schema_version": snapshot["schema_version"],
    }


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
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/prepare", dependencies=[Depends(require_fingerfood_api_token)])
def prepare_offer(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    return execute_prepare_offer(body)
