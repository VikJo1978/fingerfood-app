"""Catalog filter tests over the real items.json via the HTTP surface."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_all_items_load() -> None:
    resp = client.get("/api/items")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 201  # real Silberlöffel catalog (2026-07-06 rebuild)


def test_lunch_buffets_section_has_eight() -> None:
    resp = client.get("/api/items", params={"section": "Lunch Buffets"})
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 8
    assert all(i["item_kind"] == "composite" for i in items)


def test_diet_filter_vegan_only() -> None:
    items = client.get("/api/items", params={"diet": "vegan"}).json()
    assert items, "expected at least one vegan item in the catalog"
    assert all(i["diet_type"] == "vegan" for i in items)


def test_unknown_diet_returns_empty() -> None:
    assert client.get("/api/items", params={"diet": "carnivore"}).json() == []


def test_exclude_allergens_hides_declaring_items() -> None:
    all_items = client.get("/api/items").json()
    with_nuts = [i for i in all_items if "nuts" in i["allergens"]]
    assert with_nuts, "fixture expectation: catalog declares nuts somewhere"
    filtered = client.get("/api/items", params={"exclude_allergens": "nuts"}).json()
    ids = {i["id"] for i in filtered}
    assert all(i["id"] not in ids for i in with_nuts)
    assert len(filtered) == len(all_items) - len(with_nuts)


def test_exclude_allergens_ignores_unknown_codes() -> None:
    all_items = client.get("/api/items").json()
    filtered = client.get("/api/items", params={"exclude_allergens": "kryptonite"}).json()
    assert len(filtered) == len(all_items)


def test_max_unit_price_zero_means_no_cap() -> None:
    all_items = client.get("/api/items").json()
    assert len(client.get("/api/items", params={"max_unit_price": 0}).json()) == len(all_items)


def test_max_unit_price_caps() -> None:
    items = client.get("/api/items", params={"max_unit_price": 3}).json()
    assert items
    assert all(i["price"] <= 3 for i in items)


def test_module_filter() -> None:
    items = client.get("/api/items", params={"module": "food"}).json()
    assert items
    assert all(i["module"] == "food" for i in items)


def test_search_matches_name_case_insensitive() -> None:
    items = client.get("/api/items", params={"search": "lunch"}).json()
    assert items
    assert all(
        "lunch" in (i["name"] + i["description"] + i["category"] + i["diet_type"]).lower()
        for i in items
    )


def test_sections_endpoint_sorted_unique() -> None:
    sections = client.get("/api/items/sections").json()
    assert sections == sorted(set(sections))
    assert "Lunch Buffets" in sections
