"""Stable browser-facing employee-auth error payloads."""

from __future__ import annotations

from fastapi import HTTPException


def employee_authentication_required() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"code": "employee_authentication_required"},
    )


def employee_application_access_denied() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={"code": "employee_application_access_denied"},
    )


def employee_permission_denied() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={"code": "employee_permission_denied"},
    )


def employee_introspection_unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={"code": "employee_introspection_unavailable"},
    )


def invalid_csrf() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={"code": "invalid_csrf"},
    )


def browser_actor_spoof_rejected() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={"code": "invalid_request"},
    )
