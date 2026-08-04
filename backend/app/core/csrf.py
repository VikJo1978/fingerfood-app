"""CSRF protection for browser-authenticated Configurator BFF mutations."""

from __future__ import annotations

import secrets
import re
from typing import Literal

from starlette.requests import Request
from starlette.responses import Response

from app.core.employee_errors import invalid_csrf
from app.core.employee_session_cookie import parse_cookie_pairs

CSRF_COOKIE_NAME = "cfg_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"
_CSRF_TOKEN_BYTES = 32
_MAX_CSRF_TOKEN_LEN = 128
_CSRF_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]+$")
ParseCsrfToken = str | None | Literal["malformed"]


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(_CSRF_TOKEN_BYTES)


def set_csrf_cookie(response: Response, token: str, *, secure: bool) -> None:
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_csrf_cookie(response: Response) -> None:
    response.delete_cookie(key=CSRF_COOKIE_NAME, path="/")


def validate_csrf(request: Request) -> None:
    cookie_token = _parse_csrf_cookie(request.headers.getlist("cookie"))
    header_token = _parse_csrf_header(request.headers.getlist(CSRF_HEADER_NAME))
    if (
        cookie_token is None
        or header_token is None
        or cookie_token == "malformed"
        or header_token == "malformed"
    ):
        raise invalid_csrf()
    if not secrets.compare_digest(cookie_token, header_token):
        raise invalid_csrf()


def _parse_csrf_cookie(cookie_headers: list[str]) -> ParseCsrfToken:
    if not cookie_headers:
        return None
    if len(cookie_headers) != 1:
        return "malformed"
    values = [
        value
        for name, value in parse_cookie_pairs(cookie_headers[0])
        if name == CSRF_COOKIE_NAME
    ]
    if not values:
        return None
    if len(values) != 1:
        return "malformed"
    return _normalize_csrf_token(values[0])


def _parse_csrf_header(header_values: list[str]) -> ParseCsrfToken:
    if not header_values:
        return None
    if len(header_values) != 1:
        return "malformed"
    return _normalize_csrf_token(header_values[0])


def _normalize_csrf_token(raw: str) -> ParseCsrfToken:
    value = raw.strip()
    if not value:
        return None
    if len(value) > _MAX_CSRF_TOKEN_LEN or _CSRF_TOKEN_RE.fullmatch(value) is None:
        return "malformed"
    return value
