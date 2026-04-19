from fastapi import APIRouter

from app.core.config import settings
from app.models.offer import OfferRequest, OfferResponse
from app.services.item_service import load_items
from app.services.pricing_service import price_offer

router = APIRouter(prefix="/api/offer", tags=["offer"])


@router.post("/calculate", response_model=OfferResponse)
def calculate_offer(body: OfferRequest) -> OfferResponse:
    items_list = load_items(settings.items_json_path)
    mapping = {i.id: i for i in items_list}
    return price_offer(mapping, body)
