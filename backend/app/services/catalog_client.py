"""Read-only HTTP client for Core Office Catalog API."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import httpx

from app.models.catalog_dish import CoreCatalogDishDetail, CoreCatalogDishSummary

_log = logging.getLogger(__name__)


class CatalogClientError(Exception):
    """Catalog API request failed."""


class CatalogClient:
    """GET-only client — Configurator must never write Catalog via this path."""

    def __init__(
        self,
        base_url: str | None,
        token: str | None,
        *,
        timeout: float = 10.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._token = token or ""
        self._timeout = timeout
        self._transport = transport

    def is_configured(self) -> bool:
        return bool(self._base_url and self._token)

    def list_dishes(self, *, active_only: bool = True) -> list[CoreCatalogDishSummary]:
        params: dict[str, str] = {}
        if active_only:
            params["active_only"] = "true"
        body = self._get("/office/v1/catalog/dishes", params=params)
        dishes_raw = body.get("dishes")
        if not isinstance(dishes_raw, list):
            raise CatalogClientError("catalog dishes response invalid")
        return [CoreCatalogDishSummary.model_validate(row) for row in dishes_raw]

    def get_dish(self, dish_id: str) -> CoreCatalogDishDetail | None:
        try:
            body = self._get(f"/office/v1/catalog/dishes/{quote(dish_id, safe='')}")
        except CatalogClientError as exc:
            if "404" in str(exc):
                return None
            raise
        return CoreCatalogDishDetail.model_validate(body)

    def _get(self, path: str, *, params: dict[str, str] | None = None) -> dict[str, Any]:
        if not self.is_configured():
            raise CatalogClientError("catalog client not configured")
        url = f"{self._base_url}{path}"
        headers = {"Authorization": f"Bearer {self._token}"}
        try:
            with httpx.Client(
                timeout=self._timeout,
                transport=self._transport,
            ) as client:
                response = client.get(url, headers=headers, params=params)
        except httpx.HTTPError as exc:
            raise CatalogClientError(f"catalog request failed: {exc}") from exc
        if response.status_code == 404:
            raise CatalogClientError(f"catalog 404 for {path}")
        if response.status_code >= 400:
            raise CatalogClientError(
                f"catalog HTTP {response.status_code} for {path}"
            )
        payload = response.json()
        if not isinstance(payload, dict):
            raise CatalogClientError("catalog response must be a JSON object")
        return payload
