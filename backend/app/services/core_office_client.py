"""Write-side Core Office API client for Configurator handoff and offer preparation."""

from __future__ import annotations

import uuid
from typing import Any

import httpx


class CoreOfficeClientError(Exception):
    """Core Office API request failed."""

    def __init__(
        self,
        *,
        code: str,
        status_code: int | None = None,
    ) -> None:
        self.code = code
        self.status_code = status_code
        super().__init__(code)


def _uuid4(value: object, *, status_code: int) -> str:
    if not isinstance(value, str):
        raise CoreOfficeClientError(
            code="prepare_offer_invalid_response",
            status_code=status_code,
        )
    try:
        parsed = uuid.UUID(value)
    except ValueError as exc:
        raise CoreOfficeClientError(
            code="prepare_offer_invalid_response",
            status_code=status_code,
        ) from exc
    canonical = str(parsed)
    if parsed.version != 4 or canonical != value:
        raise CoreOfficeClientError(
            code="prepare_offer_invalid_response",
            status_code=status_code,
        )
    return canonical


def _response_payload(response: httpx.Response) -> dict[str, Any] | None:
    try:
        payload = response.json()
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


class CoreOfficeClient:
    def __init__(
        self,
        base_url: str | None,
        token: str | None,
        *,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._token = token or ""
        self._timeout = timeout
        self._transport = transport

    def is_configured(self) -> bool:
        return bool(self._base_url and self._token)

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    def get_inquiry(self, inquiry_id: str) -> dict[str, Any] | None:
        if not self.is_configured():
            raise CoreOfficeClientError(code="core_office_not_configured")
        url = f"{self._base_url}/office/v1/inquiries/{inquiry_id}"
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.get(url, headers=self._auth_headers())
        except httpx.HTTPError as exc:
            raise CoreOfficeClientError(code="inquiry_lookup_transport_error") from exc
        if response.status_code == 404:
            return None
        if response.status_code == 200:
            payload = _response_payload(response)
            if payload is None:
                raise CoreOfficeClientError(
                    code="inquiry_lookup_invalid_response",
                    status_code=response.status_code,
                )
            return payload
        raise CoreOfficeClientError(
            code="inquiry_lookup_failed",
            status_code=response.status_code,
        )

    def _post_inquiry_command(
        self,
        inquiry_id: str,
        command: str,
        *,
        args: dict[str, object],
        updated_at: str,
    ) -> dict[str, Any]:
        if not self.is_configured():
            raise CoreOfficeClientError(code="core_office_not_configured")
        url = f"{self._base_url}/office/v1/inquiries/{inquiry_id}/{command}"
        body = {
            "command_id": str(uuid.uuid4()),
            "expect": {"updated_at": updated_at},
            "args": args,
        }
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.post(url, json=body, headers=self._auth_headers())
        except httpx.HTTPError as exc:
            raise CoreOfficeClientError(code=f"{command}_transport_error") from exc
        if response.status_code != 200:
            raise CoreOfficeClientError(
                code=f"{command}_failed",
                status_code=response.status_code,
            )
        payload = _response_payload(response)
        if payload is None or not isinstance(payload.get("updated_at"), str):
            raise CoreOfficeClientError(
                code=f"{command}_invalid_response",
                status_code=response.status_code,
            )
        return payload

    def persist_fulfillment_context(
        self,
        inquiry_id: str,
        *,
        fulfillment_mode: str,
        delivery_address_mode: str,
        invoice_address: dict[str, object] | None,
        delivery_address: dict[str, object] | None,
    ) -> None:
        inquiry = self.get_inquiry(inquiry_id)
        if inquiry is None:
            raise CoreOfficeClientError(code="inquiry_not_found", status_code=404)
        updated_at = inquiry.get("updated_at")
        if not isinstance(updated_at, str) or not updated_at:
            raise CoreOfficeClientError(code="inquiry_lookup_invalid_response", status_code=200)

        address_result = self._post_inquiry_command(
            inquiry_id,
            "customer-addresses",
            args={
                "invoice_address": invoice_address,
                "delivery_address_mode": delivery_address_mode,
                "delivery_address": delivery_address,
            },
            updated_at=updated_at,
        )
        address_updated_at = address_result["updated_at"]
        if not isinstance(address_updated_at, str):
            raise CoreOfficeClientError(code="customer-addresses_invalid_response", status_code=200)

        self._post_inquiry_command(
            inquiry_id,
            "fulfillment-mode",
            args={"fulfillment_mode": fulfillment_mode},
            updated_at=address_updated_at,
        )

    def prepare_offer(
        self,
        inquiry_id: str,
        snapshot: dict[str, object],
        *,
        command_id: str | None = None,
    ) -> dict[str, Any]:
        if not self.is_configured():
            raise CoreOfficeClientError(code="core_office_not_configured")
        url = f"{self._base_url}/office/v1/inquiries/{inquiry_id}/prepare-offer"
        body = {
            "command_id": command_id or str(uuid.uuid4()),
            "expect": {},
            "args": {"snapshot": snapshot},
        }
        headers = self._auth_headers()
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.post(url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise CoreOfficeClientError(code="prepare_offer_transport_error") from exc
        if response.status_code == 201:
            payload = _response_payload(response)
            if payload is None:
                raise CoreOfficeClientError(
                    code="prepare_offer_invalid_response",
                    status_code=response.status_code,
                )
            payload["offer_id"] = _uuid4(
                payload.get("offer_id"),
                status_code=response.status_code,
            )
            return payload
        if response.status_code == 409:
            payload = _response_payload(response)
            if (
                isinstance(payload, dict)
                and payload.get("error") == "offer_already_exists"
            ):
                return {
                    "offer_id": _uuid4(
                        payload.get("offer_id"),
                        status_code=response.status_code,
                    ),
                    "existing_offer": True,
                }
        raise CoreOfficeClientError(
            code="prepare_offer_failed",
            status_code=response.status_code,
        )
