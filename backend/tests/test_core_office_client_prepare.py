"""Core prepare-offer response handling, including canonical duplicates."""

from __future__ import annotations

import httpx
import pytest

from app.services.core_office_client import CoreOfficeClient, CoreOfficeClientError

_INQUIRY_ID = "11111111-1111-4111-8111-111111111111"
_OFFER_ID = "33333333-3333-4333-8333-333333333333"


def _client(response: httpx.Response) -> CoreOfficeClient:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer core-secret"
        return response

    return CoreOfficeClient(
        "https://core.example.test",
        "core-secret",
        transport=httpx.MockTransport(handler),
    )


def test_created_offer_returns_validated_canonical_id() -> None:
    response = httpx.Response(
        201,
        json={
            "offer_id": _OFFER_ID,
            "offer_version_id": "44444444-4444-4444-8444-444444444444",
            "snapshot_id": "55555555-5555-4555-8555-555555555555",
        },
    )
    result = _client(response).prepare_offer(_INQUIRY_ID, {})
    assert result["offer_id"] == _OFFER_ID
    assert result.get("existing_offer") is None


def test_duplicate_conflict_resolves_canonical_offer_id() -> None:
    response = httpx.Response(
        409,
        json={"error": "offer_already_exists", "offer_id": _OFFER_ID},
    )
    result = _client(response).prepare_offer(_INQUIRY_ID, {})
    assert result == {"offer_id": _OFFER_ID, "existing_offer": True}


@pytest.mark.parametrize("status", [201, 409])
def test_invalid_offer_id_fails_closed(status: int) -> None:
    payload = {"offer_id": "not-a-uuid"}
    if status == 409:
        payload["error"] = "offer_already_exists"
    with pytest.raises(CoreOfficeClientError, match="invalid offer_id"):
        _client(httpx.Response(status, json=payload)).prepare_offer(_INQUIRY_ID, {})


def test_other_core_error_is_stable_and_does_not_echo_response_body() -> None:
    response = httpx.Response(
        502,
        text="snapshot customer@example.test secret-token",
    )
    with pytest.raises(CoreOfficeClientError) as exc_info:
        _client(response).prepare_offer(_INQUIRY_ID, {})
    message = str(exc_info.value)
    assert message == "prepare-offer HTTP 502: unexpected_response"
    assert "customer@example.test" not in message
    assert "secret-token" not in message
