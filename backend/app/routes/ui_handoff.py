"""Browser-facing Configurator handoff exchange (AUTH-2E3C)."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.employee_auth import (
    employee_auth_enabled,
    require_authenticated_employee,
    require_employee_permission,
    resolve_employee_session_token,
)
from app.core.csrf import validate_csrf
from app.routes.offer import safe_error_detail
from app.services.catalog_factory import (
    build_configurator_prepare_context_store,
    build_core_configurator_handoff_client,
)
from app.services.core_configurator_handoff_client import (
    CoreConfiguratorHandoffError,
)
from app.services.core_offer_redirect import build_core_inquiry_redirect_url

router = APIRouter(prefix="/api/ui/handoff", tags=["ui-handoff"])

_MAX_UI_HANDOFF_BODY_BYTES = 16 * 1024


def _invalid_request(
    status_code: int = 400, code: str = "invalid_request"
) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code})


def _validate_content_length(request: Request) -> None:
    values = request.headers.getlist("content-length")
    if not values:
        return
    if len(values) != 1:
        raise _invalid_request()
    raw_value = values[0].strip()
    if not raw_value or not raw_value.isdecimal():
        raise _invalid_request()
    if int(raw_value) > _MAX_UI_HANDOFF_BODY_BYTES:
        raise _invalid_request(status_code=413, code="request_too_large")


async def _read_request_body(request: Request) -> bytes:
    _validate_content_length(request)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > _MAX_UI_HANDOFF_BODY_BYTES:
            raise _invalid_request(status_code=413, code="request_too_large")
    return bytes(body)


def _parse_exchange_code(body_bytes: bytes) -> str:
    try:
        payload = json.loads(body_bytes)
    except json.JSONDecodeError as exc:
        raise _invalid_request() from exc
    if not isinstance(payload, dict) or set(payload.keys()) != {"code"}:
        raise _invalid_request()
    code = payload.get("code")
    if not isinstance(code, str) or not code.strip():
        raise _invalid_request()
    return code.strip()


@router.get("/open-inquiry/{context_id}")
def ui_open_inquiry(context_id: str, request: Request) -> RedirectResponse:
    if not employee_auth_enabled():
        raise HTTPException(status_code=404, detail={"code": "handoff_exchange_disabled"})

    principal = require_authenticated_employee(request)
    require_employee_permission(principal, "inquiries.view")

    context = build_configurator_prepare_context_store().get(context_id.strip())
    if context is None:
        raise HTTPException(status_code=404, detail={"code": "handoff_not_found"})
    if context.account_id != principal.account_id:
        raise HTTPException(status_code=403, detail={"code": "handoff_forbidden"})
    try:
        redirect_url = build_core_inquiry_redirect_url(
            settings.core_office_panel_url,
            context.inquiry_id,
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


@router.post("/exchange")
async def ui_exchange_handoff(request: Request) -> dict[str, object]:
    if not employee_auth_enabled():
        raise HTTPException(
            status_code=404,
            detail=safe_error_detail(
                "handoff_exchange_disabled",
                "Configurator handoff exchange is disabled.",
            ),
        )

    principal = require_authenticated_employee(request)
    require_employee_permission(principal, "offers.prepare")
    validate_csrf(request)

    employee_session_token = resolve_employee_session_token(request)
    if employee_session_token is None:
        raise HTTPException(
            status_code=401, detail={"code": "employee_authentication_required"}
        )

    code = _parse_exchange_code(await _read_request_body(request))
    core = build_core_configurator_handoff_client()
    if not core.is_configured():
        raise HTTPException(
            status_code=503,
            detail=safe_error_detail(
                "core_handoff_not_configured",
                "Core Configurator handoff exchange is not configured.",
            ),
        )
    try:
        exchanged = core.exchange(
            code=code, employee_session_token=employee_session_token
        )
    except CoreConfiguratorHandoffError as exc:
        if exc.status_code in {401, 403, 404, 410}:
            error_code = {
                401: "employee_authentication_required",
                403: "employee_permission_denied",
                404: "handoff_not_found",
                410: "handoff_gone",
            }[exc.status_code]
            raise HTTPException(
                status_code=exc.status_code, detail={"code": error_code}
            ) from exc
        if exc.code == "handoff_not_configured":
            raise HTTPException(
                status_code=503,
                detail=safe_error_detail(
                    "core_handoff_not_configured",
                    "Core Configurator handoff exchange is not configured.",
                ),
            ) from exc
        raise HTTPException(
            status_code=503,
            detail=safe_error_detail(
                "core_handoff_unavailable",
                "Core Configurator handoff exchange is unavailable.",
            ),
        ) from exc

    context = build_configurator_prepare_context_store().create(
        account_id=principal.account_id,
        operation=exchanged.operation,
        inquiry_id=exchanged.inquiry_id,
        trusted_transfer=exchanged.transfer,
    )
    return {
        "context_id": context.context_id,
        "operation": context.operation,
        "transfer": context.trusted_transfer,
        "expires_at": context.expires_at.isoformat(),
    }
