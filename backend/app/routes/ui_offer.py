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
from datetime import UTC, date, datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
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
from app.services.catalog_factory import (
    build_configurator_prepare_context_store,
    build_core_office_client,
)
from app.services.configurator_handoff_context import (
    ConfiguratorPrepareContext,
    ConfiguratorPrepareContextClaim,
)
from app.services.core_office_client import CoreOfficeClientError
from app.services.core_offer_redirect import (
    build_core_offer_redirect_url,
    normalize_core_office_panel_url,
    validate_offer_id,
)

router = APIRouter(prefix="/api/ui/offer", tags=["ui-offer"])

_MAX_UI_PREPARE_BODY_BYTES = 64 * 1024


class UiCustomerAddress(BaseModel):
    street: str
    postal_code: str
    city: str
    country: str


class UiFulfillmentContext(BaseModel):
    fulfillment_mode: Literal["UNKNOWN", "PICKUP", "DELIVERY"]
    delivery_address_mode: Literal["UNKNOWN", "SAME_AS_INVOICE", "SEPARATE"]
    invoice_address: UiCustomerAddress | None = None
    delivery_address: UiCustomerAddress | None = None


class UiOfferPrepareRequest(BaseModel):
    inquiry_id: str | None = None
    context_id: str | None = None
    snapshot_id: str
    valid_until: date
    recipient: dict[str, str]
    event: dict[str, object]
    customer_text: dict[str, str]
    payment_terms: dict[str, str]
    offer: dict[str, object]
    # Optional only for a rolling deploy: old browser builds may omit it.
    # The new configurator always sends it and gets strict validation below.
    fulfillment: UiFulfillmentContext | None = None
    source_draft_id: str | None = None
    budget_definition: dict[str, object] | None = None
    charges_definition: dict[str, object] | None = None


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


def _parse_prepare_request(body_bytes: bytes) -> UiOfferPrepareRequest:
    try:
        raw_body = json.loads(body_bytes)
    except json.JSONDecodeError as exc:
        raise _invalid_request() from exc
    if not isinstance(raw_body, dict):
        raise _invalid_request()
    reject_browser_actor_fields(raw_body)
    try:
        parsed = UiOfferPrepareRequest.model_validate(raw_body)
    except ValidationError as exc:
        raise _invalid_request(status_code=422) from exc
    if parsed.fulfillment is not None:
        _validate_fulfillment_context(parsed.fulfillment)
    return parsed


def _validate_fulfillment_context(fulfillment: UiFulfillmentContext) -> None:
    if fulfillment.fulfillment_mode == "UNKNOWN":
        raise _invalid_request(status_code=422, code="fulfillment_mode_required")
    if fulfillment.fulfillment_mode == "PICKUP":
        if fulfillment.delivery_address_mode != "UNKNOWN":
            raise _invalid_request(status_code=422, code="pickup_delivery_address_invalid")
        return
    if fulfillment.delivery_address_mode == "SAME_AS_INVOICE":
        if fulfillment.invoice_address is None:
            raise _invalid_request(status_code=422, code="invoice_address_required")
        return
    if fulfillment.delivery_address_mode == "SEPARATE":
        if fulfillment.delivery_address is None:
            raise _invalid_request(status_code=422, code="delivery_address_required")
        return
    raise _invalid_request(status_code=422, code="delivery_address_mode_required")


def _address_mapping(address: UiCustomerAddress | None) -> dict[str, object] | None:
    if address is None:
        return None
    return address.model_dump()


def _context_http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail=safe_error_detail(code, message)
    )


def _require_prepare_context(
    *,
    context_id: str | None,
    current_account_id: str,
) -> ConfiguratorPrepareContext:
    if context_id is None or not context_id.strip():
        raise _context_http_error(
            400,
            "prepare_context_required",
            "Trusted Configurator prepare context is required.",
        )
    context = build_configurator_prepare_context_store().get(context_id.strip())
    if context is None:
        raise _context_http_error(
            404,
            "prepare_context_not_found",
            "Trusted Configurator prepare context was not found.",
        )
    if context.account_id != current_account_id:
        raise _context_http_error(
            403,
            "prepare_context_forbidden",
            "Trusted Configurator prepare context belongs to a different employee.",
        )
    if context.operation != "prepare_first_offer":
        raise _context_http_error(
            409,
            "prepare_context_invalid_operation",
            "Trusted Configurator prepare context is not valid for first-offer preparation.",
        )
    if context.consumed_at is not None:
        raise _context_http_error(
            410,
            "prepare_context_consumed",
            "Trusted Configurator prepare context has already been used.",
        )
    if context.expires_at <= datetime.now(UTC):
        raise _context_http_error(
            410,
            "prepare_context_expired",
            "Trusted Configurator prepare context has expired.",
        )
    return context


def _claim_prepare_context(
    *,
    context_id: str | None,
    current_account_id: str,
) -> tuple[ConfiguratorPrepareContext, ConfiguratorPrepareContextClaim]:
    if context_id is None or not context_id.strip():
        raise _context_http_error(
            400,
            "prepare_context_required",
            "Trusted Configurator prepare context is required.",
        )
    normalized_context_id = context_id.strip()
    store = build_configurator_prepare_context_store()
    claim_result = store.claim(
        context_id=normalized_context_id,
        account_id=current_account_id,
    )
    if claim_result.claim is not None:
        context = store.get(normalized_context_id)
        if context is None:
            raise _context_http_error(
                404,
                "prepare_context_not_found",
                "Trusted Configurator prepare context was not found.",
            )
        return context, claim_result.claim
    if claim_result.status == "wrong_account":
        raise _context_http_error(
            403,
            "prepare_context_forbidden",
            "Trusted Configurator prepare context belongs to a different employee.",
        )
    if claim_result.status == "consumed":
        raise _context_http_error(
            410,
            "prepare_context_consumed",
            "Trusted Configurator prepare context has already been used.",
        )
    if claim_result.status == "expired":
        raise _context_http_error(
            410,
            "prepare_context_expired",
            "Trusted Configurator prepare context has expired.",
        )
    if claim_result.status == "active_claim":
        raise _context_http_error(
            409,
            "prepare_context_in_progress",
            "Trusted Configurator prepare context is already being prepared.",
        )
    raise _context_http_error(
        404,
        "prepare_context_not_found",
        "Trusted Configurator prepare context was not found.",
    )


def _as_text(value: object, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _trusted_prepare_body(
    request_body: UiOfferPrepareRequest,
    context: ConfiguratorPrepareContext,
) -> OfferSnapshotBuildRequest:
    transfer = context.trusted_transfer
    planning = transfer.get("planning")
    prefill = transfer.get("orderContextPrefill")
    if not isinstance(planning, dict) or not isinstance(prefill, dict):
        raise _context_http_error(
            503,
            "prepare_context_invalid",
            "Trusted Configurator prepare context is invalid.",
        )

    payload: dict[str, Any] = request_body.model_dump(exclude_none=True)
    payload.pop("context_id", None)
    payload.pop("fulfillment", None)
    payload["inquiry_id"] = context.inquiry_id
    company_name = _as_text(prefill.get("companyName"), "Angebot")
    contact_name = _as_text(prefill.get("contactPerson"), company_name)
    event_date = _as_text(prefill.get("eventDate"))
    event_time = _as_text(prefill.get("eventTime"), "–")
    location = _as_text(prefill.get("location"), "–")
    billing_address = _as_text(prefill.get("billingAddress")) or location
    remarks = _as_text(prefill.get("remarks")).strip()
    payload["recipient"] = {
        "company_name": company_name,
        "contact_name": contact_name,
        "email": _as_text(prefill.get("email"), "kunde@example.invalid"),
        "postal_address": billing_address,
    }
    payload["event"] = {
        **request_body.event,
        "event_date": event_date,
        "time_window_text": event_time,
        "location_text": location,
    }
    payload["customer_text"] = {
        "title": company_name,
        "introduction": remarks or "Angebot erstellt im Configurator.",
        "notes": remarks,
    }
    try:
        return OfferSnapshotBuildRequest.model_validate(payload)
    except ValidationError as exc:
        raise _invalid_request(status_code=422) from exc


def _untrusted_prepare_body(request_body: UiOfferPrepareRequest) -> OfferSnapshotBuildRequest:
    payload = request_body.model_dump(exclude_none=True)
    payload.pop("fulfillment", None)
    try:
        return OfferSnapshotBuildRequest.model_validate(payload)
    except ValidationError as exc:
        raise _invalid_request(status_code=422) from exc


def _persist_fulfillment(
    *,
    inquiry_id: str,
    fulfillment: UiFulfillmentContext,
) -> None:
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
        core.persist_fulfillment_context(
            inquiry_id,
            fulfillment_mode=fulfillment.fulfillment_mode,
            delivery_address_mode=fulfillment.delivery_address_mode,
            invoice_address=_address_mapping(fulfillment.invoice_address),
            delivery_address=_address_mapping(fulfillment.delivery_address),
        )
    except CoreOfficeClientError as exc:
        status = 409 if exc.status_code == 409 else 502
        raise HTTPException(
            status_code=status,
            detail=safe_error_detail(
                "core_fulfillment_persist_failed",
                "Fulfillment and delivery address could not be persisted in Core.",
            ),
        ) from exc


@router.post("/prepare")
async def ui_prepare_offer(request: Request) -> dict[str, object]:
    """Browser BFF: persist fulfillment facts, then prepare the offer in Core."""
    trusted_context: ConfiguratorPrepareContext | None = None
    trusted_claim: ConfiguratorPrepareContextClaim | None = None
    if employee_auth_enabled():
        principal = require_authenticated_employee(request)
        require_employee_permission(principal, "offers.prepare")
        validate_csrf(request)
        parsed = _parse_prepare_request(await _read_prepare_body(request))
        trusted_context, trusted_claim = _claim_prepare_context(
            context_id=parsed.context_id,
            current_account_id=principal.account_id,
        )
        inquiry_id = trusted_context.inquiry_id
        body = _trusted_prepare_body(parsed, trusted_context)
    else:
        parsed = _parse_prepare_request(await _read_prepare_body(request))
        if parsed.inquiry_id is None:
            raise _invalid_request(status_code=422)
        inquiry_id = parsed.inquiry_id
        body = _untrusted_prepare_body(parsed)

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

    # Preserve the legacy workflow-validation lookup for non-handoff callers.
    if trusted_context is None:
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

    try:
        if parsed.fulfillment is not None:
            _persist_fulfillment(inquiry_id=inquiry_id, fulfillment=parsed.fulfillment)
        result = execute_prepare_offer(body)
    except Exception:
        if trusted_claim is not None:
            build_configurator_prepare_context_store().release_claim(
                context_id=trusted_claim.context_id,
                claim_id=trusted_claim.claim_id,
            )
        raise

    if trusted_claim is not None:
        consumed = build_configurator_prepare_context_store().consume(
            context_id=trusted_claim.context_id,
            claim_id=trusted_claim.claim_id,
        )
        if not consumed:
            raise HTTPException(
                status_code=503,
                detail=safe_error_detail(
                    "prepare_context_commit_failed",
                    "Trusted Configurator prepare context could not be finalized.",
                ),
            )
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
