"""Write-side Core Office API client — prepare-offer only."""

from __future__ import annotations

import uuid
from typing import Any

import httpx


class CoreOfficeClientError(Exception):
    """Core Office API request failed."""


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
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.post(url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise CoreOfficeClientError(f"prepare-offer request failed: {exc}") from exc
        if response.status_code == 201:
            payload = response.json()
            if not isinstance(payload, dict):
                raise CoreOfficeClientError("prepare-offer response invalid")
            return payload
        detail = response.text
        raise CoreOfficeClientError(
            f"prepare-offer HTTP {response.status_code}: {detail}"
        )
