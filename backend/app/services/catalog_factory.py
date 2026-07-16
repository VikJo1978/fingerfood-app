"""Factory helpers for Catalog adapter wiring."""

from __future__ import annotations

from app.core.config import settings
from app.services.catalog_adapter import CatalogAdapter
from app.services.catalog_client import CatalogClient


def build_catalog_client() -> CatalogClient:
    return CatalogClient(settings.core_office_api_url, settings.core_office_api_token)


def build_catalog_adapter() -> CatalogAdapter:
    return CatalogAdapter(build_catalog_client())
