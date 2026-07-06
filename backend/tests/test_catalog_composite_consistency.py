"""Catalog data audit: item_kind/items_included consistency.

Rewritten 2026-07-06 for the real Silberlöffel catalog (rebuild from
Cateringangebot.pdf / Lunch_Buffets_2026.pdf / Mittagsmenue.pdf). The prior
version of this test documented four known gaps in the old placeholder
catalog (incl. "[Demo]" packages under a "Demo Pakete" section); those items
no longer exist — the whole placeholder catalog was replaced, not patched.

The two known-sets below are intentionally empty: the real catalog build
(scripts/build_items.py) produced zero inconsistencies of this class on
first pass (verified by hand before this file was written). Both tests fail
if the catalog ever regresses into either class of gap — a deliberate,
visible catalog-data decision is required to update these sets, same
discipline as before.
"""

import json
from pathlib import Path

ITEMS_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "items.json"

# item_kind=composite but items_included is empty or reads as a one-line
# service/logistics note rather than an actual dish list.
KNOWN_COMPOSITE_WITHOUT_REAL_DISH_LIST: set[str] = set()

# food/beverage items named like a package (buffet/Paket/Menü) but tagged
# item_kind=simple.
KNOWN_PACKAGE_LIKE_BUT_SIMPLE: set[str] = set()


def _looks_like_dish_list(text: str) -> bool:
    if not text:
        return False
    return text.count("\n") >= 2 or text.count("-") >= 3


def test_composite_dish_list_gaps_match_known_reviewed_set() -> None:
    items = json.loads(ITEMS_PATH.read_text())
    suspects = {
        i["id"]
        for i in items
        if i.get("item_kind") == "composite"
        and not _looks_like_dish_list(i.get("items_included") or "")
    }
    assert suspects == KNOWN_COMPOSITE_WITHOUT_REAL_DISH_LIST, (
        "composite items without a real dish list changed — a catalog owner reviewed "
        f"and either fixed or introduced entries; update KNOWN_COMPOSITE_WITHOUT_REAL_DISH_LIST "
        f"in this file to match. Current: {sorted(suspects)}"
    )


def test_package_like_simple_items_match_known_reviewed_set() -> None:
    items = json.loads(ITEMS_PATH.read_text())
    package_words = ("buffet", "paket", "menü", "menu")
    foodish = ("food", "beverage")
    suspects = {
        i["id"]
        for i in items
        if i.get("module", "food") in foodish
        and i.get("item_kind") != "composite"
        and any(w in i["name"].lower() for w in package_words)
    }
    assert suspects == KNOWN_PACKAGE_LIKE_BUT_SIMPLE, (
        "package-named simple items changed — a catalog owner reviewed and either "
        f"retagged or a new one appeared; update KNOWN_PACKAGE_LIKE_BUT_SIMPLE in this "
        f"file to match. Current: {sorted(suspects)}"
    )


def test_no_item_has_verified_allergens_yet() -> None:
    """Sanity guard for the safety rule: nobody has flipped allergens_verified
    to True without an actual review process existing yet. If/when a real
    verification step is built, this test should be replaced, not deleted."""
    items = json.loads(ITEMS_PATH.read_text())
    verified = [i["id"] for i in items if i.get("allergens_verified")]
    assert verified == [], (
        "items marked allergens_verified=True but no verification process exists yet: "
        f"{verified}"
    )
