"""Browser-facing BFF for commercial offer writes.

Network-authenticated endpoint — NOT user/session authorization unless
CONFIGURATOR_EMPLOYEE_AUTH_MODE=employee (AUTH-2E2).

Trust boundary (internal MVP):
- fingerfood listens on Tailscale IP only (see infra/systemd/BFF_ACCESS_BOUNDARY.md);
- Tailnet ACL restricts who can reach 100.109.6.74:8091;
- FINGERFOOD_API_TOKEN never sent to the browser.

The inquiry_id existence check below is workflow validation only: it confirms
the prepare targets a real Core inquiry, not that the caller is authorized.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import ValidationError

from app.core.config import settings
from app.core.csrf import validate_csrf
from app.core.employee_auth import (
    employee_auth_enabled,
    reject_browser_actor_fields,
    require_authenticated_employee,
    require_employee_permission,
)
from app.routes.offer import (
    OfferSnapshotBuildRequest,
    execute_prepare_offer,
    safe_error_detail,
)
from app.services.catalog_factory import build_core_office_client
from app.services.core_office_client import CoreOfficeClientError
from app.services.core_offer_redirect import (
    build_core_offer_redirect_url,
    normalize_core_office_panel_url,
    validate_offer_id,
)

router = APIRouter(prefix="/api/ui/offer", tags=["ui-offer"])

_MAX_UI_PREPARE_BODY_BYTES = 64 * 1024


def _invalid_request(
    status_code: int = 400, code: str = "invalid_request"
) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code})


async def _read_prepare_body(request: Request) -> bytes:
    _validate_content_length(request)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > _MAX_UI_PREPARE_BODY_BYTES:
            raise _invalid_request(status_code=413, code="request_too_large")
    return bytes(body)


def _validate_content_length(request: Request) -> None:
    values = request.headers.getlist("content-length")
    if not values:
        return
    if len(values) != 1:
        raise _invalid_request()
    raw_value = values[0].strip()
    if not raw_value or not raw_value.isdecimal():
        raise _invalid_request()
    if int(raw_value) > _MAX_UI_PREPARE_BODY_BYTES:
        raise _invalid_request(status_code=413, code="request_too_large")


def _parse_prepare_request(body_bytes: bytes) -> OfferSnapshotBuildRequest:
    try:
        raw_body = json.loads(body_bytes)
    except json.JSONDecodeError as exc:
        raise _invalid_request() from exc
    if not isinstance(raw_body, dict):
        raise _invalid_request()
    reject_browser_actor_fields(raw_body)
    try:
        return OfferSnapshotBuildRequest.model_validate(raw_body)
    except ValidationError as exc:
        raise _invalid_request(status_code=422) from exc


@router.post("/prepare")
async def ui_prepare_offer(request: Request) -> dict[str, object]:
    """Browser BFF: prepare offer in Core without browser machine token."""
    if employee_auth_enabled():
        principal = require_authenticated_employee(request)
        require_employee_permission(principal, "offers.prepare")
        validate_csrf(request)
    body = _parse_prepare_request(await _read_prepare_body(request))

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
