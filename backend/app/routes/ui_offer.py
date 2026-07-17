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
from app.services.catalog_factory import build_core_office_client
from app.services.core_office_client import CoreOfficeClientError

router = APIRouter(prefix="/api/ui/offer", tags=["ui-offer"])


@router.post("/prepare")
def ui_prepare_offer(body: OfferSnapshotBuildRequest) -> dict[str, object]:
    """Network-authenticated BFF: prepare offer in Core without browser token."""
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
    return execute_prepare_offer(body)
