"""Browser session bootstrap for Configurator employee auth (AUTH-2E2)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from app.core.config import settings
from app.core.csrf import (
    clear_csrf_cookie,
    generate_csrf_token,
    set_csrf_cookie,
)
from app.core.employee_auth import (
    employee_auth_enabled,
    resolve_employee_principal,
)
from app.core.employee_errors import employee_introspection_unavailable

router = APIRouter(prefix="/api/ui", tags=["ui-session"])


def _set_session_response_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Vary"] = "Cookie"


@router.get("/session")
def ui_session_bootstrap(request: Request, response: Response) -> dict[str, object]:
    _set_session_response_headers(response)
    mode = settings.configurator_employee_auth_mode
    if not employee_auth_enabled():
        return {
            "employee_auth_mode": mode,
            "authenticated": False,
            "application_access_allowed": False,
            "principal": None,
            "csrf_token": None,
        }

    try:
        principal = resolve_employee_principal(request)
    except HTTPException as exc:
        if exc.status_code == 401:
            clear_csrf_cookie(response)
            return {
                "employee_auth_mode": mode,
                "authenticated": False,
                "application_access_allowed": False,
                "principal": None,
                "csrf_token": None,
            }
        if exc.status_code == 403:
            clear_csrf_cookie(response)
            return {
                "employee_auth_mode": mode,
                "authenticated": True,
                "application_access_allowed": False,
                "principal": None,
                "csrf_token": None,
            }
        if exc.status_code == 503:
            raise HTTPException(
                status_code=503,
                detail=employee_introspection_unavailable().detail,
                headers={"Cache-Control": "no-store", "Vary": "Cookie"},
            ) from exc
        raise

    csrf_token = generate_csrf_token()
    set_csrf_cookie(
        response,
        csrf_token,
        secure=settings.configurator_csrf_cookie_secure,
    )
    return {
        "employee_auth_mode": mode,
        "authenticated": True,
        "application_access_allowed": True,
        "principal": principal.to_session_json(),
        "csrf_token": csrf_token,
    }
