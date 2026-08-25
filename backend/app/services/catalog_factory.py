"""Factory helpers for Catalog adapter wiring."""

from __future__ import annotations

from app.core.config import settings
from app.services.catalog_adapter import CatalogAdapter
from app.services.catalog_client import CatalogClient
from app.services.configurator_handoff_context import ConfiguratorPrepareContextStore
from app.services.core_configurator_handoff_client import CoreConfiguratorHandoffClient
from app.services.core_customer_history_client import CoreCustomerHistoryClient
from app.services.core_office_client import CoreOfficeClient


def build_catalog_client() -> CatalogClient:
    return CatalogClient(settings.core_office_api_url, settings.core_office_api_token)


def build_catalog_adapter() -> CatalogAdapter:
    return CatalogAdapter(build_catalog_client())


def build_core_office_client() -> CoreOfficeClient:
    return CoreOfficeClient(
        settings.core_office_api_url, settings.core_office_api_token
    )


def build_core_customer_history_client() -> CoreCustomerHistoryClient:
    return CoreCustomerHistoryClient(
        settings.core_office_api_url, settings.core_office_api_token
    )


def build_core_configurator_handoff_client() -> CoreConfiguratorHandoffClient:
    return CoreConfiguratorHandoffClient(
        base_url=settings.core_office_api_url,
        service_token=settings.configurator_handoff_service_token,
    )


def build_configurator_prepare_context_store() -> ConfiguratorPrepareContextStore:
    return ConfiguratorPrepareContextStore(settings.configurator_handoff_context_db)
