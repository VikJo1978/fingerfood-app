from typing import Literal

from pydantic import BaseModel, Field


class OfferLineIn(BaseModel):
    item_id: str
    quantity_mode: Literal["total", "per_person"]
    quantity: float = Field(gt=0)


class OfferRequest(BaseModel):
    persons: int = Field(ge=1, le=5000)
    lines: list[OfferLineIn] = Field(default_factory=list)


class LinePricing(BaseModel):
    item_id: str
    quantity_mode: Literal["total", "per_person"]
    quantity: float
    line_total: float
    warnings: list[str] = Field(default_factory=list)


class OfferResponse(BaseModel):
    persons: int
    subtotal: float
    price_per_person: float
    lines: list[LinePricing]
    warnings: list[str] = Field(default_factory=list)
