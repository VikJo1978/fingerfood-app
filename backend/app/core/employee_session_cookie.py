"""Parse the Core employee session cookie for BFF introspection."""

from __future__ import annotations

import re
from typing import Literal

EMPLOYEE_SESSION_COOKIE = "sl_employee_session"
_MAX_EMPLOYEE_SESSION_LEN = 256
_SESSION_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]+$")

ParseSessionCookie = str | None | Literal["malformed"]


def parse_cookie_pairs(cookie_header: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for part in cookie_header.split(";"):
        chunk = part.strip()
        if not chunk or "=" not in chunk:
            continue
        name, value = chunk.split("=", 1)
        pairs.append((name.strip(), value.strip()))
    return pairs


def parse_employee_session_cookie(
    cookie_headers: str | list[str] | None,
) -> ParseSessionCookie:
    headers = _normalize_cookie_headers(cookie_headers)
    if not headers:
        return None
    if len(headers) != 1:
        return "malformed"
    values = [
        value
        for name, value in parse_cookie_pairs(headers[0])
        if name == EMPLOYEE_SESSION_COOKIE
    ]
    if not values:
        return None
    if len(values) != 1:
        return "malformed"
    return _normalize_employee_session_token(values[0])


def _normalize_employee_session_token(raw: str) -> ParseSessionCookie:
    value = raw.strip()
    if not value:
        return None
    if (
        len(value) > _MAX_EMPLOYEE_SESSION_LEN
        or _SESSION_TOKEN_RE.fullmatch(value) is None
    ):
        return "malformed"
    return value


def _normalize_cookie_headers(cookie_headers: str | list[str] | None) -> list[str]:
    if cookie_headers is None:
        return []
    if isinstance(cookie_headers, str):
        return [cookie_headers]
    return list(cookie_headers)
