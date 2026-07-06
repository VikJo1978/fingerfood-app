"""Unit tests for the VAT classification function itself (scripts/derive_vat_rate.py).

The real catalog currently has zero beverage/staff/tableware/equipment items
(none of the three source PDFs include drinks or rentals), so these cases
can't be asserted against items.json directly — tested at the function level
instead, so a future beverage/service catalog addition is classified
correctly from day one.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.derive_vat_rate import PAUSCHALEN_VAT_RATE_PERCENT, derive_vat_rate  # noqa: E402


def test_food_is_seven_percent_regardless_of_item_kind() -> None:
    assert derive_vat_rate("food", "simple") == 7
    assert derive_vat_rate("food", "composite") == 7


def test_beverage_is_nineteen_percent() -> None:
    assert derive_vat_rate("beverage", "simple") == 19
    assert derive_vat_rate("beverage", "composite") == 19


def test_service_and_equipment_modules_are_nineteen_percent() -> None:
    assert derive_vat_rate("staff", "simple") == 19
    assert derive_vat_rate("tableware", "simple") == 19
    assert derive_vat_rate("equipment", "simple") == 19


def test_pauschalen_constant_is_nineteen_percent() -> None:
    assert PAUSCHALEN_VAT_RATE_PERCENT == 19
