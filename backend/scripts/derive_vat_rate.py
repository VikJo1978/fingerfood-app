"""Deterministic, auditable VAT rate classification for German catering.

Owner-approved rule (2026-07-06), based on the "Lieferung vs. sonstige
Leistung" combined-supply doctrine (Abschn. 3.6 UStAE / EuGH "Bog" / BFH case
law): pure food/beverage delivery without service elements is taxed at the
reduced 7% rate; anything with a service character (staff, tableware,
equipment provision, or a buffet/package that inherently requires setup and
serving equipment) is taxed at the standard 19% rate.

This is a best-effort classification, NOT a certified tax position. The
office's Steuerberater should confirm before this is relied on for real
invoices — see Item.vat_rate_percent docstring and the UI disclaimer.
"""

from __future__ import annotations


def derive_vat_rate(module: str, item_kind: str) -> int:
    """7%: a simple, individually-priced food/beverage item (pure delivery).
    19%: everything else — composite buffets/packages (inherently need
    chafing dishes / setup / service per their own Büffetpauschale rationale),
    and any staff/tableware/equipment item (always a service/rental, never a
    food delivery)."""
    if module in ("food", "beverage") and item_kind == "simple":
        return 7
    return 19


# The three flat Pauschalen (Büffetpauschale, Geschirrpauschale, Anlieferung)
# are service/logistics charges, not food delivery — always 19% under the
# same rule, regardless of what's in the order.
PAUSCHALEN_VAT_RATE_PERCENT = 19
