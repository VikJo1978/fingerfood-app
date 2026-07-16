from decimal import Decimal

from app.services.pricing_math import (
    calculate_vat_cents,
    euros_to_cents,
    multiply_cents,
)


def test_half_cent_rounds_commercially() -> None:
    assert euros_to_cents("2.675") == 268
    assert multiply_cents(535, Decimal("0.5")) == 268


def test_fractional_quantity_multiplies_integer_cents() -> None:
    assert multiply_cents(230, Decimal("1.5")) == 345


def test_vat_is_calculated_from_integer_cents() -> None:
    assert calculate_vat_cents(10_000, 7) == 700
