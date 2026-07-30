"""E2E: Configurator snapshot builder → Core prepare-offer → OfferPosition V2."""

from __future__ import annotations

import json
import queue
import sys
import threading
import uuid
from datetime import date
from pathlib import Path

import httpx
import pytest

from app.models.classification import DietType
from app.models.item import Item
from app.models.offer import OfferLineIn, OfferRequest
from app.services.catalog_adapter import CatalogAdapter
from app.services.catalog_client import CatalogClient
from app.services.catalog_ids import dish_id_from_source_id
from app.services.core_office_client import CoreOfficeClient
from app.services.offer_snapshot_service import build_offer_snapshot_v2

_CORE_SRC = Path.home() / "projects/silberlöffelcatering" / "src"
if _CORE_SRC.exists():
    sys.path.insert(0, str(_CORE_SRC))

pytestmark = pytest.mark.skipif(
    not _CORE_SRC.exists(),
    reason="silberlöffelcatering src not available for e2e",
)

_SOURCE_ID = "broetchen-mix-1"
_DISH_ID = dish_id_from_source_id(_SOURCE_ID)
_TOKEN = "test-office-api-token"


def _item() -> Item:
    return Item(
        id=_SOURCE_ID,
        name="Pasta",
        section="Test",
        category="Test",
        price=9.0,
        price_type="piece",
        min_order=1,
        unit_label="Portion",
        description="Test",
        surcharge_label="Lachs oder Rind",
        surcharge_amount=1.0,
        diet_type=DietType.omnivore,
        vat_rate_percent=7,
    )


def _write_items(path: Path) -> None:
    path.write_text(
        json.dumps([_item().model_dump(mode="json")]),
        encoding="utf-8",
    )


def _catalog_list_response() -> dict[str, object]:
    return {
        "dishes": [
            {
                "dish_id": _DISH_ID,
                "name": "Pasta",
                "current_unit_net_cents": 1200,
                "price_display": "12.00 €",
                "allergens": ["A", "G"],
                "allergen_labels": ["Gluten", "Milch"],
                "active": True,
            }
        ],
        "total_count": 1,
        "truncated": False,
    }


def _catalog_detail_response() -> dict[str, object]:
    dish = _catalog_list_response()["dishes"][0]
    assert isinstance(dish, dict)
    return {
        **dish,
        "description": "Catalog description",
        "composition": "Catalog composition",
        "notes": None,
        "created_at": "2026-07-16T08:00:00+00:00",
        "updated_at": "2026-07-16T08:00:00+00:00",
    }


def _mock_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if (
            request.url.path.endswith("/catalog/dishes")
            and "/dishes/" not in request.url.path
        ):
            return httpx.Response(200, json=_catalog_list_response())
        if "/catalog/dishes/" in request.url.path:
            return httpx.Response(200, json=_catalog_detail_response())
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture()
def core_api(tmp_path: Path):
    from catering_system.domain.offer_pdf import OfferPdfStaticContent
    from catering_system.repositories.sqlite_inquiry_repository import (
        SQLiteInquiryRepository,
    )
    from catering_system.services.inquiry_service import InquiryService
    from catering_system.ui.office_api import create_office_api_server

    db = tmp_path / "core.db"
    inquiries = SQLiteInquiryRepository(db)
    service = InquiryService(inquiries)
    inquiry = service.create_inquiry(
        event_date=date(2026, 8, 20),
        inquiry_source="manual",
        crm_stage="Neue Anfrage",
        customer_linkage={},
        time_window_text="18:00–22:00",
        location_text="Hamburg",
        guest_count_estimate=80,
        planning_mode="caterer_suggestion",
        call_verification_required=False,
        call_verification_status="not_required",
        contact_email="kunde@example.test",
        contact_phone="+49401234567",
    )
    inquiries.close()

    ready: queue.Queue = queue.Queue()

    def run() -> None:
        server = create_office_api_server(
            str(db),
            _TOKEN,
            "127.0.0.1",
            0,
            offer_pdf_static_content=OfferPdfStaticContent(
                company_legal_name="Test Catering GmbH",
                company_address_lines=("Teststraße 1", "20095 Hamburg"),
                acceptance_statement="Annahme durch schriftliche Bestätigung.",
            ),
        )
        ready.put(server)
        server.serve_forever()

    threading.Thread(target=run, daemon=True).start()
    server = ready.get(timeout=5)
    host, port = server.server_address[:2]
    base = f"http://{host}:{port}"
    yield base, db, inquiry.inquiry_id
    server.shutdown()
    server.server_close()


def test_catalog_to_core_prepare_offer_preserves_allergens(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    base, db, inquiry_id = core_api
    items_path = tmp_path / "items.json"
    _write_items(items_path)
    catalog_client = CatalogClient(
        "http://catalog.test", "token", transport=_mock_transport()
    )
    adapter = CatalogAdapter(catalog_client, items_path=items_path)
    offer = OfferRequest(
        persons=10,
        lines=[
            OfferLineIn(
                item_id=_SOURCE_ID,
                quantity_mode="total",
                quantity=10,
                surcharge_selected=True,
            )
        ],
    )
    snapshot = build_offer_snapshot_v2(
        adapter=adapter,
        inquiry_id=inquiry_id,
        snapshot_id=str(uuid.uuid4()),
        valid_until=date(2026, 7, 30),
        recipient={
            "company_name": "Example",
            "contact_name": "Contact",
            "email": "a@example.invalid",
            "postal_address": "Address",
        },
        event={
            "event_date": "2026-08-20",
            "time_window_text": "18:00–22:00",
            "location_text": "Hamburg",
            "guest_count": 10,
            "planning_mode": "caterer_suggestion",
        },
        customer_text={"title": "Pasta", "introduction": "Intro", "notes": ""},
        payment_terms={"method": "RECHNUNG", "customer_visible_text": "Rechnung"},
        offer=offer,
    )

    core = CoreOfficeClient(base, _TOKEN)
    result = core.prepare_offer(inquiry_id, snapshot)
    assert result["offer_id"]

    from catering_system.repositories.sqlite_offer_repository import (
        SQLiteOfferRepository,
    )

    repo = SQLiteOfferRepository(db)
    try:
        stored = repo.get(result["offer_id"])
        assert stored is not None
        position = stored.versions[0].variants[0].positions[0]
        assert position.unit_net_cents == 1200
        assert position.allergens == ("A", "G")
        assert [item.kind for item in stored.versions[0].variants[0].positions] == [
            "catalog",
            "surcharge",
            "fee",
            "fee",
            "fee",
        ]
        surcharge = stored.versions[0].variants[0].positions[1]
        assert surcharge.related_position_id == position.position_id
        positions = stored.versions[0].variants[0].positions
        assert sum(item.net_total_cents for item in positions) == 19000
        assert sum(item.vat_amount_cents for item in positions) == 2050
        assert sum(item.gross_total_cents for item in positions) == 21050
    finally:
        repo.close()

    detail = httpx.get(
        f"{base}/office/v1/offers/{result['offer_id']}",
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert detail.status_code == 200
    api_position = detail.json()["versions"][0]["variants"][0]["positions"][0]
    assert api_position["allergens"] == ["A", "G"]
    assert api_position["unit_net_cents"] == 1200
