from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.services.core_office_client import CoreOfficeClient, CoreOfficeClientError
from app.services.core_production_signal_adapter import CoreSameDayDemandRow

EVENT_DATE = date(2026, 8, 23)


def _client(handler: httpx.MockTransport) -> CoreOfficeClient:
    return CoreOfficeClient(
        "https://core.example.test",
        "core-secret",
        transport=handler,
    )


def test_recommendation_demand_maps_core_rows_and_sends_auth_and_date() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/office/v1/recommendation-demand"
        assert request.url.params == {"date": "2026-08-23"}
        assert request.headers["Authorization"] == "Bearer core-secret"
        return httpx.Response(
            200,
            json={
                "event_date": "2026-08-23",
                "rows": [
                    {
                        "catalog_item_id": "dish-a",
                        "lifecycle": "CONFIRMED_ORDER",
                    },
                    {
                        "catalog_item_id": "dish-b",
                        "lifecycle": "ACCEPTED_ORDER",
                    },
                    {
                        "catalog_item_id": "dish-c",
                        "lifecycle": "SENT_OFFER",
                    },
                ],
            },
        )

    rows = _client(httpx.MockTransport(handler)).get_recommendation_demand(EVENT_DATE)

    assert rows == (
        CoreSameDayDemandRow("dish-a", "CONFIRMED_ORDER"),
        CoreSameDayDemandRow("dish-b", "ACCEPTED_ORDER"),
        CoreSameDayDemandRow("dish-c", "SENT_OFFER"),
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"event_date": "2026-08-24", "rows": []},
        {"event_date": "2026-08-23", "rows": {}},
        {
            "event_date": "2026-08-23",
            "rows": [{"catalog_item_id": "", "lifecycle": "CONFIRMED_ORDER"}],
        },
        {
            "event_date": "2026-08-23",
            "rows": [{"catalog_item_id": "dish-a", "lifecycle": "UNKNOWN"}],
        },
        {"event_date": "2026-08-23", "rows": ["not-an-object"]},
    ],
)
def test_recommendation_demand_invalid_schema_fails_closed(payload: object) -> None:
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, json=payload))

    with pytest.raises(CoreOfficeClientError) as exc_info:
        _client(transport).get_recommendation_demand(EVENT_DATE)

    assert exc_info.value.code == "recommendation_demand_invalid_response"
    assert exc_info.value.status_code == 200


def test_recommendation_demand_http_error_is_stable() -> None:
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(502, text="customer@example.test secret-token")
    )

    with pytest.raises(CoreOfficeClientError) as exc_info:
        _client(transport).get_recommendation_demand(EVENT_DATE)

    assert exc_info.value.code == "recommendation_demand_failed"
    assert exc_info.value.status_code == 502
    assert str(exc_info.value) == "recommendation_demand_failed"


def test_recommendation_demand_transport_error_is_stable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sensitive transport diagnostics", request=request)

    with pytest.raises(CoreOfficeClientError) as exc_info:
        _client(httpx.MockTransport(handler)).get_recommendation_demand(EVENT_DATE)

    assert exc_info.value.code == "recommendation_demand_transport_error"
    assert exc_info.value.status_code is None
    assert str(exc_info.value) == "recommendation_demand_transport_error"
