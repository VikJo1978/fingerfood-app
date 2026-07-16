from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.offer import OfferRequest
from app.services.catalog_factory import build_catalog_adapter
from app.services.offer_snapshot_service import build_offer_snapshot_v2
from app.services.pricing_service import price_offer

router = APIRouter(prefix="/api/offer", tags=["offer"])


@router.post("/calculate")
def calculate_offer(body: OfferRequest):
    adapter = build_catalog_adapter()
    loaded = adapter.load_items_for_compose()
    return price_offer(loaded.items, body)


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


@router.post("/snapshot")
def build_snapshot(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    adapter = build_catalog_adapter()
    try:
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
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
