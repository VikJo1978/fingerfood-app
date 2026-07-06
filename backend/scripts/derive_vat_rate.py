"""Deterministic, auditable VAT rate classification for German catering.

Owner-stated legal basis (2026-07-06): since 1 January 2026 a permanent
reduced VAT rate of 7% applies to all Speisen (food) in catering/Bewirtung —
including buffets and packages, regardless of how the food is bundled. The
regular 19% rate continues to apply to all Getränke (beverages) and to
additional services such as equipment rental (Möbel, Geschirr) and service
staff/setup (Personal, Aufbau).

Practical rule as stated:
  - Speisen & Buffets: 7%
  - Getränke: 19%
  - Servicepersonal & Aufbau: 19%

Note on all-inclusive billing: when food and beverages are billed as one
undifferentiated lump sum, the tax office permits a flat 30% Getränkeanteil
(taxed at 19%) / 70% food (taxed at 7%) split as a simplification. This
system does NOT use that fallback — the catalog is itemized per dish/drink
(each item carries its own `module`), which is the exact line-item
separation the tax office itself prefers ("für eine exakte steuerliche
Abgrenzung empfiehlt sich immer die genaue Trennung der Posten"). The 30%
heuristic would only become relevant if a future all-inclusive flat-price
package item bundled food and drink under one price without a `module` split.

Correction history:
  - v1 classified only item_kind=simple food as 7%, composite buffets as 19%
    (wrong: conflated "needs service" with "is food").
  - v2 classified all food AND beverage as 7% (wrong: beverages are 19% under
    the actual 2026 rule, not 7%).
  - v3 (this version): food = 7% always; beverage = 19%; staff/tableware/
    equipment = 19%.

This reflects the owner's stated understanding of current law, not
independent legal research — the office's Steuerberater should confirm
before this is relied on for real invoices. See Item.vat_rate_percent
docstring and the UI disclaimer.
"""

from __future__ import annotations


def derive_vat_rate(module: str, item_kind: str) -> int:
    """7%: food (Speisen), any packaging — a buffet is still food.
    19%: beverages, and staff/tableware/equipment (service/rental, never
    food). `item_kind` is accepted for signature stability / future
    refinement but does not currently affect the result."""
    del item_kind  # not used by the current rule; kept for future refinement
    if module == "food":
        return 7
    return 19


# The three flat Pauschalen (Büffetpauschale, Geschirrpauschale, Anlieferung)
# are service/logistics charges, not food — always 19%.
PAUSCHALEN_VAT_RATE_PERCENT = 19
