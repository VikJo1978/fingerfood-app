"""Catalog data audit: item_kind/items_included consistency.

This test does not guess catalog content — `items_included` is used for two
different meanings (real dish composition vs. a logistics/service note), and
only a catalog owner can say which an item should be. The test documents the
CURRENT known gaps by name; it fails if the set changes in either direction
(new regression, or a silent fix) so any change to catalog composite/package
data is a deliberate, visible edit — not a silent drift.

Found 2026-07-06 while auditing why "Warmes Fingerfood-Buffet" showed no
composition in the Angebotsvorschau even though items_included was set.
"""

import json
from pathlib import Path

ITEMS_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "items.json"

# item_kind=composite but items_included is empty or reads as a one-line
# service/logistics note rather than an actual dish list — the
# Angebotsvorschau shows this text under a "ZUSAMMENSETZUNG" heading, which
# is misleading (or, for paket-service-empfang, nothing shows at all).
KNOWN_COMPOSITE_WITHOUT_REAL_DISH_LIST = {
    "paket-getraenke-standard",  # items_included: "inkl. Abstimmung mit Service vor Ort"
    "paket-buffet-business",  # items_included: "inkl. Auf- und Abbau-Service (nach Verfügbarkeit)"
    "paket-service-empfang",  # items_included is empty — "Paket" badge shows, composition doesn't
}

# food/beverage items named like a package (buffet/Paket/Menü) but tagged
# item_kind=simple — their items_included never surfaces as a composition in
# the Angebotsvorschau, only as a generic catalog-card note.
KNOWN_PACKAGE_LIKE_BUT_SIMPLE = {
    "buffet-finger",  # "Warmes Fingerfood-Buffet"; items_included is a setup note, not a dish list
    "getraenke-paket",  # items_included: "inkl. Eiswürfel nach Bedarf" — a note, not a drinks list
}


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
