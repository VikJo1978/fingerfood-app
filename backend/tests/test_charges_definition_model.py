"""Unit tests — CONFIGURABLE_OFFER_CHARGES_V1 Configurator-side request models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.charges_definition import ChargesDefinitionIn


def _valid_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "delivery": {"amount_cents": 3500},
        "dishware": {
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [],
        },
        "buffet": {"base_mode": "NONE", "pauschale_per_person_cents": 50},
    }
    payload.update(overrides)
    return payload


def test_valid_full_payload_parses() -> None:
    parsed = ChargesDefinitionIn.model_validate(_valid_payload())
    assert parsed.delivery.amount_cents == 3500
    assert parsed.dishware.base_mode == "NONE"
    assert parsed.buffet.base_mode == "NONE"


def test_dishware_with_additional_lines_parses() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "PAUSCHALE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {"description": "Weinglas", "quantity": 20, "unit_net_cents": 80}
            ],
        }
    )
    parsed = ChargesDefinitionIn.model_validate(payload)
    assert len(parsed.dishware.additional_lines) == 1
    assert parsed.dishware.additional_lines[0].description == "Weinglas"


def test_rejects_unknown_top_level_key() -> None:
    payload = _valid_payload()
    payload["extra"] = 1
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_unknown_delivery_key() -> None:
    payload = _valid_payload(delivery={"amount_cents": 3500, "extra": 1})
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_unknown_dishware_key() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [],
            "extra": 1,
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_unknown_buffet_key() -> None:
    payload = _valid_payload(
        buffet={"base_mode": "NONE", "pauschale_per_person_cents": 50, "extra": 1}
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_unknown_dishware_line_key() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {
                    "description": "Weinglas",
                    "quantity": 20,
                    "unit_net_cents": 80,
                    "extra": 1,
                }
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_requires_all_three_sections() -> None:
    payload = _valid_payload()
    del payload["buffet"]
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


@pytest.mark.parametrize(
    "path",
    [
        ("delivery", "amount_cents"),
        ("dishware", "pauschale_per_person_cents"),
        ("buffet", "pauschale_per_person_cents"),
    ],
)
def test_rejects_bool_as_money_cents(path: tuple[str, str]) -> None:
    section, field = path
    payload = _valid_payload()
    section_payload = dict(payload[section])  # type: ignore[arg-type]
    section_payload[field] = True
    payload[section] = section_payload
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


@pytest.mark.parametrize(
    "path",
    [
        ("delivery", "amount_cents"),
        ("dishware", "pauschale_per_person_cents"),
        ("buffet", "pauschale_per_person_cents"),
    ],
)
def test_rejects_float_as_money_cents(path: tuple[str, str]) -> None:
    section, field = path
    payload = _valid_payload()
    section_payload = dict(payload[section])  # type: ignore[arg-type]
    section_payload[field] = 35.0
    payload[section] = section_payload
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_negative_delivery_amount() -> None:
    payload = _valid_payload(delivery={"amount_cents": -1})
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_delivery_zero_is_valid() -> None:
    parsed = ChargesDefinitionIn.model_validate(
        _valid_payload(delivery={"amount_cents": 0})
    )
    assert parsed.delivery.amount_cents == 0


@pytest.mark.parametrize("base_mode", ["none", "pauschale", "MAYBE", ""])
def test_rejects_invalid_base_mode(base_mode: str) -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": base_mode,
            "pauschale_per_person_cents": 200,
            "additional_lines": [],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_empty_line_description() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {"description": "", "quantity": 1, "unit_net_cents": 100}
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_untrimmed_line_description() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {"description": " Weinglas ", "quantity": 1, "unit_net_cents": 100}
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_zero_line_quantity() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {"description": "Weinglas", "quantity": 0, "unit_net_cents": 100}
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_negative_line_quantity() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {"description": "Weinglas", "quantity": -1, "unit_net_cents": 100}
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_fractional_line_quantity() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {"description": "Weinglas", "quantity": 1.5, "unit_net_cents": 100}
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_bool_line_quantity() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {"description": "Weinglas", "quantity": True, "unit_net_cents": 100}
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_negative_line_unit_net_cents() -> None:
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {"description": "Weinglas", "quantity": 1, "unit_net_cents": -1}
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_client_supplied_net_total_cents() -> None:
    """No such field exists on the model at all — extra='forbid' catches it,
    matching Core's rule that net totals are always server-derived."""
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": [
                {
                    "description": "Weinglas",
                    "quantity": 20,
                    "unit_net_cents": 80,
                    "net_total_cents": 1600,
                }
            ],
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)


def test_rejects_too_many_additional_lines() -> None:
    lines = [
        {"description": f"Line {i}", "quantity": 1, "unit_net_cents": 10}
        for i in range(101)
    ]
    payload = _valid_payload(
        dishware={
            "base_mode": "NONE",
            "pauschale_per_person_cents": 200,
            "additional_lines": lines,
        }
    )
    with pytest.raises(ValidationError):
        ChargesDefinitionIn.model_validate(payload)
