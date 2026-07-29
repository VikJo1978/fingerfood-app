"""Write-side Core Office API client — prepare-offer only."""

from __future__ import annotations

import uuid
from typing import Any

import httpx


class CoreOfficeClientError(Exception):
    """Core Office API request failed."""


def _uuid4(value: object, *, field: str) -> str:
    if not isinstance(value, str):
        raise CoreOfficeClientError(f"prepare-offer response invalid {field}")
    try:
        parsed = uuid.UUID(value)
    except ValueError as exc:
        raise CoreOfficeClientError(
            f"prepare-offer response invalid {field}"
        ) from exc
    canonical = str(parsed)
    if parsed.version != 4 or canonical != value:
        raise CoreOfficeClientError(f"prepare-offer response invalid {field}")
    return canonical


def _response_payload(response: httpx.Response) -> dict[str, Any] | None:
    try:
        payload = response.json()
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


def _error_code(response: httpx.Response) -> str:
    payload = _response_payload(response)
    if payload is None:
        return "unexpected_response"
    code = payload.get("error")
    return code if isinstance(code, str) else "unexpected_response"


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
            raise CoreOfficeClientError("core office client not configured")
        url = f"{self._base_url}/office/v1/inquiries/{inquiry_id}"
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.get(url, headers=self._auth_headers())
        except httpx.HTTPError as exc:
            raise CoreOfficeClientError(f"inquiry lookup failed: {exc}") from exc
        if response.status_code == 404:
            return None
        if response.status_code == 200:
            payload = response.json()
            if not isinstance(payload, dict):
                raise CoreOfficeClientError("inquiry response invalid")
            return payload
        raise CoreOfficeClientError(
            f"inquiry lookup HTTP {response.status_code}: {response.text}"
        )

    def prepare_offer(
        self,
        inquiry_id: str,
        snapshot: dict[str, object],
        *,
        command_id: str | None = None,
    ) -> dict[str, Any]:
        if not self.is_configured():
            raise CoreOfficeClientError("core office client not configured")
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
            raise CoreOfficeClientError(f"prepare-offer request failed: {exc}") from exc
        if response.status_code == 201:
            payload = _response_payload(response)
            if payload is None:
                raise CoreOfficeClientError("prepare-offer response invalid")
            payload["offer_id"] = _uuid4(payload.get("offer_id"), field="offer_id")
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
                        field="offer_id",
                    ),
                    "existing_offer": True,
                }
        raise CoreOfficeClientError(
            f"prepare-offer HTTP {response.status_code}: {_error_code(response)}"
        )
