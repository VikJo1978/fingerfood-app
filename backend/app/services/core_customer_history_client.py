"""Focused reader for factual customer order history from Core Office API."""

from __future__ import annotations

from datetime import date

import httpx

from app.services.core_customer_history_adapter import (
    CoreCustomerHistoryDish,
    CoreCustomerHistoryOrder,
)


class CoreCustomerHistoryClientError(Exception):
    pass


class CoreCustomerHistoryClient:
    def __init__(self, base_url: str | None, token: str | None, *, timeout: float = 30.0) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._token = token or ""
        self._timeout = timeout

    def list_for_customer(self, customer_id: str) -> tuple[CoreCustomerHistoryOrder, ...]:
        if not self._base_url or not self._token:
            raise CoreCustomerHistoryClientError("core_office_not_configured")
        url = f"{self._base_url}/office/v1/customers/{customer_id}/order-history"
        try:
            response = httpx.get(
                url,
                headers={"Authorization": f"Bearer {self._token}"},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise CoreCustomerHistoryClientError("customer_history_transport_error") from exc
        if response.status_code != 200:
            raise CoreCustomerHistoryClientError("customer_history_failed")
        try:
            payload = response.json()
        except ValueError as exc:
            raise CoreCustomerHistoryClientError("customer_history_invalid_response") from exc
        if not isinstance(payload, dict) or payload.get("customer_id") != customer_id:
            raise CoreCustomerHistoryClientError("customer_history_invalid_response")
        raw_orders = payload.get("orders")
        if not isinstance(raw_orders, list):
            raise CoreCustomerHistoryClientError("customer_history_invalid_response")

        orders: list[CoreCustomerHistoryOrder] = []
        for raw_order in raw_orders:
            if not isinstance(raw_order, dict):
                raise CoreCustomerHistoryClientError("customer_history_invalid_response")
            order_id = raw_order.get("order_id")
            event_date_raw = raw_order.get("event_date")
            cancelled_at = raw_order.get("cancelled_at")
            raw_dishes = raw_order.get("dishes")
            if (
                not isinstance(order_id, str)
                or not order_id
                or not isinstance(event_date_raw, str)
                or not isinstance(raw_dishes, list)
                or (cancelled_at is not None and not isinstance(cancelled_at, str))
            ):
                raise CoreCustomerHistoryClientError("customer_history_invalid_response")
            try:
                event_date = date.fromisoformat(event_date_raw)
            except ValueError as exc:
                raise CoreCustomerHistoryClientError("customer_history_invalid_response") from exc
            dishes: list[CoreCustomerHistoryDish] = []
            for raw_dish in raw_dishes:
                if not isinstance(raw_dish, dict):
                    raise CoreCustomerHistoryClientError("customer_history_invalid_response")
                item_id = raw_dish.get("catalog_item_id")
                name = raw_dish.get("name")
                if item_id is None:
                    continue
                if not isinstance(item_id, str) or not item_id or not isinstance(name, str):
                    raise CoreCustomerHistoryClientError("customer_history_invalid_response")
                dishes.append(CoreCustomerHistoryDish(item_id=item_id, name=name))
            orders.append(
                CoreCustomerHistoryOrder(
                    order_id=order_id,
                    event_date=event_date,
                    cancelled=cancelled_at is not None,
                    dishes=tuple(dishes),
                )
            )
        return tuple(orders)
