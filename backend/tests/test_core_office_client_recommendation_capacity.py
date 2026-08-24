from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.services.core_capacity_signal_adapter import CoreCapacityRow
from app.services.core_office_client import CoreOfficeClient, CoreOfficeClientError

EVENT_DATE = date(2026, 8, 31)


def _client(handler: httpx.MockTransport) -> CoreOfficeClient:
    return CoreOfficeClient(
        "https://core.example.test",
        "core-secret",
        transport=handler,
    )


def test_recommendation_capacity_maps_rows_and_sends_auth_and_date() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/office/v1/recommendation-capacity"
        assert request.url.params.get("date") == "2026-08-31"
        assert request.headers["Authorization"] == "Bearer core-secret"
        return httpx.Response(
            200,
            json={
                "event_date": "2026-08-31",
                "rows": [
                    {
                        "catalog_item_id": "dish-a",
                        "feasible": True,
                        "overload_penalty": 35,
                        "reason_code": None,
                    },
                    {
                        "catalog_item_id": "dish-b",
                        "feasible": False,
                        "overload_penalty": 100,
                        "reason_code": "CAPACITY_UNSET",
                    },
                ],
            },
        )

    rows = _client(httpx.MockTransport(handler)).get_recommendation_capacity(EVENT_DATE)

    assert rows == (
        CoreCapacityRow("dish-a", True, 35),
        CoreCapacityRow("dish-b", False, 100, "CAPACITY_UNSET"),
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"event_date": "2026-09-01", "rows": []},
        {"event_date": "2026-08-31", "rows": {}},
        {
            "event_date": "2026-08-31",
            "rows": [
                {
                    "catalog_item_id": "",
                    "feasible": True,
                    "overload_penalty": 0,
                    "reason_code": None,
                }
            ],
        },
        {
            "event_date": "2026-08-31",
            "rows": [
                {
                    "catalog_item_id": "dish-a",
                    "feasible": "yes",
                    "overload_penalty": 0,
                    "reason_code": None,
                }
            ],
        },
        {
            "event_date": "2026-08-31",
            "rows": [
                {
                    "catalog_item_id": "dish-a",
                    "feasible": True,
                    "overload_penalty": 101,
                    "reason_code": None,
                }
            ],
        },
        {"event_date": "2026-08-31", "rows": ["not-an-object"]},
    ],
)
def test_recommendation_capacity_invalid_schema_fails_closed(payload: object) -> None:
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, json=payload))

    with pytest.raises(CoreOfficeClientError) as exc_info:
        _client(transport).get_recommendation_capacity(EVENT_DATE)

    assert exc_info.value.code == "recommendation_capacity_invalid_response"
    assert exc_info.value.status_code == 200


def test_recommendation_capacity_http_error_is_stable() -> None:
    transport = httpx.MockTransport(lambda _request: httpx.Response(502, text="secret"))

    with pytest.raises(CoreOfficeClientError) as exc_info:
        _client(transport).get_recommendation_capacity(EVENT_DATE)

    assert exc_info.value.code == "recommendation_capacity_failed"
    assert exc_info.value.status_code == 502


def test_recommendation_capacity_transport_error_is_stable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sensitive diagnostics", request=request)

    with pytest.raises(CoreOfficeClientError) as exc_info:
        _client(httpx.MockTransport(handler)).get_recommendation_capacity(EVENT_DATE)

    assert exc_info.value.code == "recommendation_capacity_transport_error"
    assert exc_info.value.status_code is None
