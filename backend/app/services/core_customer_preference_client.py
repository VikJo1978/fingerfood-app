"""Focused reader for explicit customer gastronomic preferences from Core."""

from __future__ import annotations

import httpx

from app.services.core_customer_preference_adapter import CoreCustomerPreference


class CoreCustomerPreferenceClientError(Exception):
    pass


class CoreCustomerPreferenceClient:
    def __init__(self, base_url: str | None, token: str | None, *, timeout: float = 30.0) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._token = token or ""
        self._timeout = timeout

    def list_for_customer(self, customer_id: str) -> tuple[CoreCustomerPreference, ...]:
        if not self._base_url or not self._token:
            raise CoreCustomerPreferenceClientError("core_office_not_configured")
        url = f"{self._base_url}/office/v1/customers/{customer_id}/gastronomic-preferences"
        try:
            response = httpx.get(
                url,
                headers={"Authorization": f"Bearer {self._token}"},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise CoreCustomerPreferenceClientError("customer_preferences_transport_error") from exc
        if response.status_code != 200:
            raise CoreCustomerPreferenceClientError("customer_preferences_failed")
        try:
            payload = response.json()
        except ValueError as exc:
            raise CoreCustomerPreferenceClientError("customer_preferences_invalid_response") from exc
        if not isinstance(payload, dict) or payload.get("customer_id") != customer_id:
            raise CoreCustomerPreferenceClientError("customer_preferences_invalid_response")
        raw_preferences = payload.get("preferences")
        if not isinstance(raw_preferences, list):
            raise CoreCustomerPreferenceClientError("customer_preferences_invalid_response")

        preferences: list[CoreCustomerPreference] = []
        for raw in raw_preferences:
            if not isinstance(raw, dict):
                raise CoreCustomerPreferenceClientError("customer_preferences_invalid_response")
            kind = raw.get("kind")
            value = raw.get("value")
            source = raw.get("source")
            if (
                not isinstance(kind, str)
                or not isinstance(value, str)
                or not isinstance(source, str)
            ):
                raise CoreCustomerPreferenceClientError("customer_preferences_invalid_response")
            if source not in {"customer_stated", "office_recorded"}:
                raise CoreCustomerPreferenceClientError("customer_preferences_invalid_response")
            preferences.append(
                CoreCustomerPreference(kind=kind, value=value, source=source)
            )
        return tuple(preferences)
