"""Trusted Core Offer return URL construction."""

from __future__ import annotations

import pytest

from app.services.core_offer_redirect import (
    build_core_offer_redirect_url,
    normalize_core_office_panel_url,
    validate_offer_id,
)

_OFFER_ID = "33333333-3333-4333-8333-333333333333"


def test_build_redirect_uses_configured_origin_and_canonical_offer_id() -> None:
    assert build_core_offer_redirect_url(
        "https://office.example.test/",
        _OFFER_ID,
    ) == f"https://office.example.test/offer/{_OFFER_ID}"


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "relative",
        "ftp://office.example.test",
        "https://user:secret@office.example.test",
        "https://office.example.test/base",
        "https://office.example.test?next=https://attacker.example",
        "https://office.example.test#fragment",
    ],
)
def test_panel_origin_rejects_unsafe_configuration(value: str | None) -> None:
    with pytest.raises(ValueError, match="CORE_OFFICE_PANEL_URL"):
        normalize_core_office_panel_url(value)


@pytest.mark.parametrize(
    "value",
    [
        "not-a-uuid",
        "11111111-1111-1111-1111-111111111111",
        "33333333-3333-4333-8333-333333333333/../../admin",
        "33333333-3333-4333-8333-333333333333?next=evil",
        "a3333333-3333-4333-8333-333333333333".upper(),
    ],
)
def test_offer_id_must_be_canonical_uuid4(value: str) -> None:
    with pytest.raises(ValueError, match="canonical uuid4"):
        validate_offer_id(value)
