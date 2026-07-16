"""Exact cent arithmetic for authoritative offer pricing."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import TypeAlias

DecimalInput: TypeAlias = Decimal | float | int | str

_ONE_CENT = Decimal("1")
_HUNDRED = Decimal(100)


def quantity_decimal(value: DecimalInput) -> Decimal:
    """Convert a request quantity without inheriting binary-float noise."""

    return Decimal(str(value))


def euros_to_cents(value: DecimalInput) -> int:
    """Convert a legacy euro value to cents using commercial rounding."""

    cents = quantity_decimal(value) * _HUNDRED
    return int(cents.quantize(_ONE_CENT, rounding=ROUND_HALF_UP))


def cents_to_float(cents: int) -> float:
    """Project authoritative cents to the legacy JSON float representation."""

    return float(Decimal(cents) / _HUNDRED)


def multiply_cents(
    unit_cents: int,
    quantity: DecimalInput,
    *,
    multiplier: int = 1,
) -> int:
    """Multiply cents by a possibly fractional quantity and round once."""

    value = Decimal(unit_cents) * quantity_decimal(quantity) * Decimal(multiplier)
    return int(value.quantize(_ONE_CENT, rounding=ROUND_HALF_UP))


def divide_cents(cents: int, divisor: int) -> int:
    """Divide cents for a display-derived per-person amount."""

    if divisor <= 0:
        return 0
    value = Decimal(cents) / Decimal(divisor)
    return int(value.quantize(_ONE_CENT, rounding=ROUND_HALF_UP))


def calculate_vat_cents(net_cents: int, vat_rate_percent: int) -> int:
    """Calculate VAT from net cents using ROUND_HALF_UP."""

    value = Decimal(net_cents) * Decimal(vat_rate_percent) / _HUNDRED
    return int(value.quantize(_ONE_CENT, rounding=ROUND_HALF_UP))
