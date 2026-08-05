"""Core Configurator handoff exchange client (AUTH-2E3B / AUTH-2E3C)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


class CoreConfiguratorHandoffError(Exception):
    def __init__(self, *, code: str, status_code: int | None = None) -> None:
        self.code = code
        self.status_code = status_code
        super().__init__(code)


@dataclass(frozen=True)
class ExchangedCoreHandoff:
    handoff_id: str
    operation: str
    inquiry_id: str
    transfer: dict[str, object]
    expires_at: str


class CoreConfiguratorHandoffClient:
    def __init__(
        self,
        *,
        base_url: str | None,
        service_token: str | None,
        timeout: float = 10.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._service_token = service_token or ""
        self._timeout = timeout
        self._transport = transport

    def is_configured(self) -> bool:
        return bool(self._base_url and self._service_token)

    def exchange(
        self,
        *,
        code: str,
        employee_session_token: str,
    ) -> ExchangedCoreHandoff:
        if not self.is_configured():
            raise CoreConfiguratorHandoffError(code="handoff_not_configured")
        try:
            with httpx.Client(
                timeout=self._timeout, transport=self._transport
            ) as client:
                response = client.post(
                    f"{self._base_url}/office/v1/auth/configurator-handoff/exchange",
                    headers={
                        "Authorization": f"Bearer {self._service_token}",
                        "Content-Type": "application/json",
                        "X-Employee-Session": employee_session_token,
                    },
                    json={"code": code},
                )
        except httpx.HTTPError as exc:
            raise CoreConfiguratorHandoffError(code="handoff_transport_error") from exc

        if response.status_code == 200:
            return _parse_exchange_response(response)
        if response.status_code in {401, 403, 404, 410}:
            raise CoreConfiguratorHandoffError(
                code=f"handoff_http_{response.status_code}",
                status_code=response.status_code,
            )
        raise CoreConfiguratorHandoffError(
            code="handoff_exchange_failed",
            status_code=response.status_code,
        )


def _parse_exchange_response(response: httpx.Response) -> ExchangedCoreHandoff:
    payload = response.json()
    if not isinstance(payload, dict):
        raise CoreConfiguratorHandoffError(
            code="handoff_invalid_response",
            status_code=response.status_code,
        )
    inquiry = payload.get("inquiry")
    if not isinstance(inquiry, dict):
        raise CoreConfiguratorHandoffError(
            code="handoff_invalid_response",
            status_code=response.status_code,
        )
    transfer = inquiry.get("transfer")
    if not isinstance(transfer, dict):
        raise CoreConfiguratorHandoffError(
            code="handoff_invalid_response",
            status_code=response.status_code,
        )
    return ExchangedCoreHandoff(
        handoff_id=_required_text(payload.get("handoff_id"), response.status_code),
        operation=_required_text(payload.get("operation"), response.status_code),
        inquiry_id=_required_text(inquiry.get("inquiry_id"), response.status_code),
        transfer=_dict_object(transfer, response.status_code),
        expires_at=_required_text(payload.get("expires_at"), response.status_code),
    )


def _required_text(value: object, status_code: int) -> str:
    if not isinstance(value, str) or not value:
        raise CoreConfiguratorHandoffError(
            code="handoff_invalid_response",
            status_code=status_code,
        )
    return value


def _dict_object(value: dict[str, Any], status_code: int) -> dict[str, object]:
    parsed: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            raise CoreConfiguratorHandoffError(
                code="handoff_invalid_response",
                status_code=status_code,
            )
        parsed[key] = item
    return parsed
