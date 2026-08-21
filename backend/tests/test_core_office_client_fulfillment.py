"""Focused contract tests for Configurator fulfillment persistence in Core."""

from __future__ import annotations

import json

import httpx

from app.services.core_office_client import CoreOfficeClient

_INQUIRY_ID = "11111111-1111-4111-8111-111111111111"


def test_persist_fulfillment_context_updates_addresses_then_mode() -> None:
    seen: list[tuple[str, dict[str, object]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer core-secret"
        if request.method == "GET":
            assert request.url.path == f"/office/v1/inquiries/{_INQUIRY_ID}"
            return httpx.Response(
                200,
                json={"inquiry_id": _INQUIRY_ID, "updated_at": "2026-08-21T20:00:00+00:00"},
            )

        body = json.loads(request.content)
        seen.append((request.url.path, body))
        if request.url.path.endswith("/customer-addresses"):
            return httpx.Response(
                200,
                json={
                    "inquiry_id": _INQUIRY_ID,
                    "updated_at": "2026-08-21T20:00:01+00:00",
                },
            )
        if request.url.path.endswith("/fulfillment-mode"):
            return httpx.Response(
                200,
                json={
                    "inquiry_id": _INQUIRY_ID,
                    "updated_at": "2026-08-21T20:00:02+00:00",
                    "fulfillment_mode": "DELIVERY",
                },
            )
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    client = CoreOfficeClient(
        "https://core.example.test",
        "core-secret",
        transport=httpx.MockTransport(handler),
    )
    invoice = {
        "street": "Musterstraße 1",
        "postal_code": "20095",
        "city": "Hamburg",
        "country": "DE",
    }
    delivery = {
        "street": "Eventweg 2",
        "postal_code": "20354",
        "city": "Hamburg",
        "country": "DE",
    }

    client.persist_fulfillment_context(
        _INQUIRY_ID,
        fulfillment_mode="DELIVERY",
        delivery_address_mode="SEPARATE",
        invoice_address=invoice,
        delivery_address=delivery,
    )

    assert [path.rsplit("/", 1)[-1] for path, _ in seen] == [
        "customer-addresses",
        "fulfillment-mode",
    ]
    address_body = seen[0][1]
    assert address_body["expect"] == {"updated_at": "2026-08-21T20:00:00+00:00"}
    assert address_body["args"] == {
        "invoice_address": invoice,
        "delivery_address_mode": "SEPARATE",
        "delivery_address": delivery,
    }
    mode_body = seen[1][1]
    assert mode_body["expect"] == {"updated_at": "2026-08-21T20:00:01+00:00"}
    assert mode_body["args"] == {"fulfillment_mode": "DELIVERY"}
