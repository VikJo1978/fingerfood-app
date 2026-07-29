"""Trusted Core Office Panel return navigation."""

from __future__ import annotations

import uuid
from urllib.parse import quote, urlsplit, urlunsplit


def normalize_core_office_panel_url(raw: str | None) -> str:
    value = (raw or "").strip()
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("CORE_OFFICE_PANEL_URL must be an absolute HTTP(S) origin")
    if (
        parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("CORE_OFFICE_PANEL_URL must be an absolute HTTP(S) origin")
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def validate_offer_id(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("offer_id must be a canonical uuid4")
    try:
        parsed = uuid.UUID(value)
    except ValueError as exc:
        raise ValueError("offer_id must be a canonical uuid4") from exc
    canonical = str(parsed)
    if parsed.version != 4 or canonical != value:
        raise ValueError("offer_id must be a canonical uuid4")
    return canonical


def build_core_offer_redirect_url(
    panel_url: str | None,
    offer_id: object,
) -> str:
    origin = normalize_core_office_panel_url(panel_url)
    canonical_offer_id = validate_offer_id(offer_id)
    return f"{origin}/offer/{quote(canonical_offer_id, safe='')}"
