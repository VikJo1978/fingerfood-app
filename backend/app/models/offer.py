from typing import Literal

from pydantic import BaseModel, Field

WarningSeverity = Literal["info", "warning", "blocking"]


class OfferWarning(BaseModel):
    code: str
    severity: WarningSeverity
    message: str


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
    warnings: list[OfferWarning] = Field(default_factory=list)
    # Best-effort VAT classification (see scripts/derive_vat_rate.py) — not a
    # certified tax position.
    vat_rate_percent: int = 19
    vat_amount: float = 0.0


class OfferResponse(BaseModel):
    persons: int
    subtotal: float
    price_per_person: float
    lines: list[LinePricing]
    warnings: list[OfferWarning] = Field(default_factory=list)
    # Real Silberlöffel V1 flat fees (see pricing_service.py PAUSCHALEN_*).
    # Applied unconditionally per offer for V1 — not conditioned on delivery
    # vs. pickup or on order size; a documented approximation, not a rule
    # derived from customer choice.
    buffetpauschale: float = 0.0
    geschirrpauschale: float = 0.0
    anlieferung: float = 0.0
    grand_total: float = 0.0
    # Best-effort VAT breakdown (see scripts/derive_vat_rate.py) — owner-approved
    # classification rule, NOT a certified tax position; confirm with the
    # Steuerberater before relying on this for real invoices.
    vat_7_percent_base: float = 0.0
    vat_7_percent_amount: float = 0.0
    vat_19_percent_base: float = 0.0
    vat_19_percent_amount: float = 0.0
    total_incl_vat: float = 0.0
