"""Browser-facing BFF for commercial offer writes.

Network-authenticated endpoint — NOT user/session authorization.

Trust boundary (internal MVP):
- fingerfood listens on Tailscale IP only (see infra/systemd/BFF_ACCESS_BOUNDARY.md);
- Tailnet ACL restricts who can reach 100.109.6.74:8091;
- FINGERFOOD_API_TOKEN never sent to the browser.

The inquiry_id existence check below is workflow validation only: it confirms
the prepare targets a real Core inquiry, not that the caller is authorized.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.routes.offer import (
    OfferSnapshotBuildRequest,
    execute_prepare_offer,
    safe_error_detail,
)
from app.core.config import settings
from app.services.catalog_factory import build_core_office_client
from app.services.core_office_client import CoreOfficeClientError
from app.services.core_offer_redirect import (
    build_core_offer_redirect_url,
    normalize_core_office_panel_url,
    validate_offer_id,
)

router = APIRouter(prefix="/api/ui/offer", tags=["ui-offer"])


@router.post("/prepare")
def ui_prepare_offer(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    """Network-authenticated BFF: prepare offer in Core without browser token."""
    try:
        normalize_core_office_panel_url(settings.core_office_panel_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=503,
            detail=safe_error_detail(
                "core_office_panel_not_configured",
                "Core Office Panel return URL is not configured.",
            ),
        ) from exc
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
        inquiry = core.get_inquiry(body.inquiry_id)
    except CoreOfficeClientError as exc:
        raise HTTPException(
            status_code=502,
            detail=safe_error_detail(
                "core_inquiry_lookup_failed",
                "Core inquiry lookup failed.",
            ),
        ) from exc
    if inquiry is None:
        raise HTTPException(
            status_code=404,
            detail=safe_error_detail(
                "inquiry_not_found",
                "Inquiry was not found.",
            ),
        )
    result = execute_prepare_offer(body)
    try:
        offer_id = validate_offer_id(result["offer_id"])
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=safe_error_detail(
                "core_offer_response_invalid",
                "Core offer preparation returned an invalid response.",
            ),
        ) from exc
    return {"offer_id": offer_id}


@router.get("/open/{offer_id}")
def ui_open_offer(offer_id: str) -> RedirectResponse:
    """Redirect a canonical offer id through trusted server configuration."""
    try:
        canonical_offer_id = validate_offer_id(offer_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=safe_error_detail(
                "invalid_offer_id",
                "Offer id is invalid.",
            ),
        ) from exc
    try:
        redirect_url = build_core_offer_redirect_url(
            settings.core_office_panel_url,
            canonical_offer_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=503,
            detail=safe_error_detail(
                "core_office_panel_not_configured",
                "Core Office Panel return URL is not configured.",
            ),
        ) from exc
    return RedirectResponse(url=redirect_url, status_code=302)
