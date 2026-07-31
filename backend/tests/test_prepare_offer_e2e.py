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
from app.services.core_office_client import CoreOfficeClient, CoreOfficeClientError
from app.services.offer_snapshot_service import build_offer_snapshot_v2
from app.services.snapshot_hash import compute_snapshot_hash

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


def test_catalog_to_core_prepare_offer_preserves_budget_definition(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    """OFFER_BUDGET_DEFINITION_V1, full cross-repo round trip: Configurator
    backend snapshot builder -> real Core prepare-offer HTTP endpoint ->
    Core SQLite persistence -> Core Office API read. No mocking of Core on
    either side of the boundary."""
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
                surcharge_selected=False,
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
        budget_definition={
            "amount_cents": 3500,
            "type": "PER_PERSON",
            "tax_basis": "GROSS",
            "cost_scope": "FULL_OFFER",
        },
    )
    assert snapshot["budget_definition"]["amount_cents"] == 3500

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
        budget = stored.versions[0].budget_definition
        assert budget is not None
        assert budget.amount_cents == 3500
        assert budget.type == "PER_PERSON"
        assert budget.tax_basis == "GROSS"
        assert budget.cost_scope == "FULL_OFFER"
    finally:
        repo.close()

    detail = httpx.get(
        f"{base}/office/v1/offers/{result['offer_id']}",
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert detail.status_code == 200
    api_budget = detail.json()["versions"][0]["budget_definition"]
    assert api_budget["amount_cents"] == 3500
    assert api_budget["type"] == "PER_PERSON"
    assert api_budget["tax_basis"] == "GROSS"
    assert api_budget["cost_scope"] == "FULL_OFFER"
    # comparison/remaining/over are pre-computed server-side from the
    # already-frozen position cents, not re-derived client-side.
    assert isinstance(api_budget["comparison_amount_cents"], int)
    assert isinstance(api_budget["remaining_cents"], int)
    assert isinstance(api_budget["over"], bool)


def test_catalog_to_core_prepare_offer_omits_budget_definition_when_disabled(
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
                surcharge_selected=False,
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
        # budget_definition omitted — budget tracking disabled.
    )
    assert "budget_definition" not in snapshot

    core = CoreOfficeClient(base, _TOKEN)
    result = core.prepare_offer(inquiry_id, snapshot)

    detail = httpx.get(
        f"{base}/office/v1/offers/{result['offer_id']}",
        headers={"Authorization": f"Bearer {_TOKEN}"},
    )
    assert detail.status_code == 200
    assert "budget_definition" not in detail.json()["versions"][0]


# --- CONFIGURABLE_OFFER_CHARGES_V1: cross-repository contract tests ----------------
#
# Full round trip: Configurator backend snapshot builder -> real Core PR #62
# prepare-offer HTTP endpoint -> Core SQLite persistence. No mocking of Core
# on either side of the boundary, same technique as the budget_definition
# tests above.

_CHARGES_GUEST_COUNT = 10


def _charges_adapter(tmp_path: Path) -> CatalogAdapter:
    items_path = tmp_path / "items.json"
    _write_items(items_path)
    return CatalogAdapter(
        CatalogClient("http://catalog.test", "token", transport=_mock_transport()),
        items_path=items_path,
    )


def _charges_offer() -> OfferRequest:
    return OfferRequest(
        persons=_CHARGES_GUEST_COUNT,
        lines=[
            OfferLineIn(
                item_id=_SOURCE_ID,
                quantity_mode="total",
                quantity=10,
                surcharge_selected=False,
            )
        ],
    )


def _charges_snapshot(
    *,
    adapter: CatalogAdapter,
    inquiry_id: str,
    charges_definition: dict[str, object] | None,
    guest_count: int | None = _CHARGES_GUEST_COUNT,
) -> dict[str, object]:
    return build_offer_snapshot_v2(
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
            "guest_count": guest_count,
            "planning_mode": "caterer_suggestion",
        },
        customer_text={"title": "Pasta", "introduction": "Intro", "notes": ""},
        payment_terms={"method": "RECHNUNG", "customer_visible_text": "Rechnung"},
        offer=_charges_offer(),
        charges_definition=charges_definition,
    )


def _charges(
    *,
    delivery_amount_cents: int = 3500,
    dishware_base_mode: str = "NONE",
    dishware_per_person_cents: int = 200,
    dishware_lines: list[dict[str, object]] | None = None,
    buffet_base_mode: str = "NONE",
    buffet_per_person_cents: int = 50,
) -> dict[str, object]:
    return {
        "delivery": {"amount_cents": delivery_amount_cents},
        "dishware": {
            "base_mode": dishware_base_mode,
            "pauschale_per_person_cents": dishware_per_person_cents,
            "additional_lines": dishware_lines or [],
        },
        "buffet": {
            "base_mode": buffet_base_mode,
            "pauschale_per_person_cents": buffet_per_person_cents,
        },
    }


def _prepare_and_load(
    base: str, db: Path, inquiry_id: str, snapshot: dict[str, object]
):
    from catering_system.repositories.sqlite_offer_repository import (
        SQLiteOfferRepository,
    )

    core = CoreOfficeClient(base, _TOKEN)
    result = core.prepare_offer(inquiry_id, snapshot)
    repo = SQLiteOfferRepository(db)
    try:
        stored = repo.get(result["offer_id"])
    finally:
        repo.close()
    return result, stored


def test_charges_1_both_none_delivery_3500(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    base, db, inquiry_id = core_api
    snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(),
    )
    _, stored = _prepare_and_load(base, db, inquiry_id, snapshot)
    assert stored is not None
    positions = stored.versions[0].variants[0].positions
    kinds = [p.kind for p in positions]
    assert kinds.count("delivery") == 1
    assert "dishware" not in kinds
    assert "buffet_fee" not in kinds
    charges = stored.versions[0].charges_definition
    assert charges is not None
    assert charges.delivery.amount_cents == 3500
    assert charges.dishware.base_mode == "NONE"
    assert charges.buffet.base_mode == "NONE"


def test_charges_2_buffet_pauschale_dishware_none(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    base, db, inquiry_id = core_api
    snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(buffet_base_mode="PAUSCHALE"),
    )
    _, stored = _prepare_and_load(base, db, inquiry_id, snapshot)
    assert stored is not None
    positions = stored.versions[0].variants[0].positions
    buffet = [p for p in positions if p.kind == "buffet_fee"]
    assert len(buffet) == 1
    assert buffet[0].net_total_cents == 50 * _CHARGES_GUEST_COUNT
    assert not [p for p in positions if p.kind == "dishware"]


def test_charges_3_dishware_pauschale_buffet_none(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    base, db, inquiry_id = core_api
    snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(dishware_base_mode="PAUSCHALE"),
    )
    _, stored = _prepare_and_load(base, db, inquiry_id, snapshot)
    assert stored is not None
    positions = stored.versions[0].variants[0].positions
    dishware = [p for p in positions if p.kind == "dishware"]
    assert len(dishware) == 1
    assert dishware[0].net_total_cents == 200 * _CHARGES_GUEST_COUNT
    assert not [p for p in positions if p.kind == "buffet_fee"]


def test_charges_4_dishware_lines_without_pauschale(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    base, db, inquiry_id = core_api
    snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(
            dishware_base_mode="NONE",
            dishware_lines=[
                {"description": "Weinglas", "quantity": 20, "unit_net_cents": 80}
            ],
        ),
    )
    _, stored = _prepare_and_load(base, db, inquiry_id, snapshot)
    assert stored is not None
    positions = stored.versions[0].variants[0].positions
    dishware = [p for p in positions if p.kind == "dishware"]
    assert len(dishware) == 1
    assert dishware[0].name == "Weinglas"
    assert dishware[0].net_total_cents == 1600


def test_charges_5_dishware_pauschale_plus_lines(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    base, db, inquiry_id = core_api
    snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(
            dishware_base_mode="PAUSCHALE",
            dishware_lines=[
                {"description": "Weinglas", "quantity": 20, "unit_net_cents": 80}
            ],
        ),
    )
    _, stored = _prepare_and_load(base, db, inquiry_id, snapshot)
    assert stored is not None
    positions = stored.versions[0].variants[0].positions
    dishware = [p for p in positions if p.kind == "dishware"]
    assert len(dishware) == 2
    assert {p.name for p in dishware} == {"Geschirrpauschale", "Weinglas"}


def test_charges_6_delivery_zero(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    base, db, inquiry_id = core_api
    snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(delivery_amount_cents=0),
    )
    _, stored = _prepare_and_load(base, db, inquiry_id, snapshot)
    assert stored is not None
    positions = stored.versions[0].variants[0].positions
    delivery = [p for p in positions if p.kind == "delivery"]
    assert len(delivery) == 1
    assert delivery[0].net_total_cents == 0


def test_charges_7_zero_guests_with_pauschale_rejected_by_core(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    """Configurator's own build_offer_snapshot_v2 already refuses to build
    this snapshot locally (see
    test_offer_snapshot_charges.py::test_dishware_pauschale_without_guest_count_raises,
    which additionally covers guest_count=None). Proven separately here:
    even a hand-crafted envelope that bypasses the Configurator backend
    entirely — guest_count mutated to 0 after a valid snapshot was already
    built — is independently rejected by the real Core server, confirming
    the contract is enforced on both sides."""
    base, db, inquiry_id = core_api
    valid_snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(dishware_base_mode="PAUSCHALE"),
    )
    tampered = dict(valid_snapshot)
    tampered["event"] = {**valid_snapshot["event"], "guest_count": 0}  # type: ignore[dict-item]
    tampered["snapshot_hash"] = compute_snapshot_hash(tampered)

    core = CoreOfficeClient(base, _TOKEN)
    with pytest.raises(CoreOfficeClientError):
        core.prepare_offer(inquiry_id, tampered)


def test_charges_8_unknown_field_rejected_by_core(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    """Same defense-in-depth shape as scenario 7: Configurator's own
    ChargesDefinitionIn (extra='forbid') already refuses this locally (see
    test_charges_definition_model.py) — this proves Core's own
    _reject_unknown_keys independently rejects it too, for a hand-crafted
    envelope that bypasses the Configurator backend's own validation."""
    base, db, inquiry_id = core_api
    valid_snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(),
    )
    tampered = dict(valid_snapshot)
    tampered_charges = dict(valid_snapshot["charges_definition"])  # type: ignore[arg-type]
    tampered_charges["unexpected_field"] = 1
    tampered["charges_definition"] = tampered_charges
    tampered["snapshot_hash"] = compute_snapshot_hash(tampered)

    core = CoreOfficeClient(base, _TOKEN)
    with pytest.raises(CoreOfficeClientError):
        core.prepare_offer(inquiry_id, tampered)


def test_charges_9_omitted_charges_definition_uses_legacy_path(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    base, db, inquiry_id = core_api
    snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=None,
    )
    assert "charges_definition" not in snapshot
    _, stored = _prepare_and_load(base, db, inquiry_id, snapshot)
    assert stored is not None
    positions = stored.versions[0].variants[0].positions
    assert [p.kind for p in positions][-3:] == ["fee", "fee", "fee"]
    assert stored.versions[0].charges_definition is None


def test_charges_10_generated_totals_match_core_validation(
    tmp_path: Path, core_api: tuple[str, Path, str]
) -> None:
    """Every scenario above already proves this implicitly — Core's
    unconditional per-position/per-variant arithmetic validation and the
    new charges-vs-positions consistency check reject the snapshot outright
    on any mismatch, so a 201 response is itself the proof. This test makes
    the totals comparison explicit and readable."""
    base, db, inquiry_id = core_api
    snapshot = _charges_snapshot(
        adapter=_charges_adapter(tmp_path),
        inquiry_id=inquiry_id,
        charges_definition=_charges(
            dishware_base_mode="PAUSCHALE",
            dishware_lines=[
                {"description": "Weinglas", "quantity": 20, "unit_net_cents": 80}
            ],
            buffet_base_mode="PAUSCHALE",
        ),
    )
    declared_totals = snapshot["variants"][0]["totals"]  # type: ignore[index]
    _, stored = _prepare_and_load(base, db, inquiry_id, snapshot)
    assert stored is not None
    positions = stored.versions[0].variants[0].positions
    assert sum(p.net_total_cents for p in positions) == declared_totals["net_cents"]  # type: ignore[index]
    assert (
        sum(p.gross_total_cents for p in positions) == declared_totals["gross_cents"]  # type: ignore[index]
    )
