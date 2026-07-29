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

from app.routes.offer import OfferSnapshotBuildRequest, execute_prepare_offer
from app.core.config import settings
from app.services.catalog_factory import build_core_office_client
from app.services.core_office_client import CoreOfficeClientError
from app.services.core_offer_redirect import (
    build_core_offer_redirect_url,
    normalize_core_office_panel_url,
)

router = APIRouter(prefix="/api/ui/offer", tags=["ui-offer"])


@router.post("/prepare")
def ui_prepare_offer(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    """Network-authenticated BFF: prepare offer in Core without browser token."""
    try:
        panel_origin = normalize_core_office_panel_url(
            settings.core_office_panel_url
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=503,
            detail="CORE_OFFICE_PANEL_URL required and must be a safe origin",
        ) from exc
    core = build_core_office_client()
    if not core.is_configured():
        raise HTTPException(
            status_code=503,
            detail="CORE_OFFICE_API_URL and CORE_OFFICE_API_TOKEN required",
        )
    try:
        inquiry = core.get_inquiry(body.inquiry_id)
    except CoreOfficeClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if inquiry is None:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    result = execute_prepare_offer(body)
    try:
        redirect_url = build_core_offer_redirect_url(
            panel_origin,
            result["offer_id"],
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Core prepare-offer response invalid",
        ) from exc
    return {
        "offer_id": result["offer_id"],
        "redirect_url": redirect_url,
    }
