"""CONFIGURABLE_OFFER_CHARGES_V1 — Configurator-side request models.

Mirrors the Core PR #62 contract (silberloeffel-catering
``domain/offer_charges.py`` / ``services/offer_snapshot_validation.py``) as
closely as pydantic allows: unknown keys rejected, integer-cents-only money
fields (bool/float rejected via ``strict=True``, since plain pydantic ``int``
otherwise silently coerces ``bool``), ``base_mode`` restricted to
``NONE``/``PAUSCHALE``, additional-line ``description`` trimmed and
non-empty, ``quantity`` a strict positive integer, no client-supplied
``net_total_cents`` field at all (the server always derives it — see
``services/offer_snapshot_service.py``).

This is local, fast, client-side request-shape validation only. Deep
cross-field consistency (declared charges vs. the snapshot's own
materialized positions/totals) remains Core's sole responsibility and is not
duplicated here.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ChargeBaseMode = Literal["NONE", "PAUSCHALE"]

# Mirrors Core's MAX_SHORT_TEXT_LEN / MAX_POSITIONS_PER_VARIANT
# (silberloeffel-catering domain/offer_snapshot.py) — Configurator has no
# equivalent limits of its own for this shape, so Core's are reused directly
# rather than inventing new ones.
_MAX_DESCRIPTION_LEN = 500
_MAX_ADDITIONAL_LINES = 100

_Cents = Annotated[int, Field(strict=True, ge=0)]
_PositiveQuantity = Annotated[int, Field(strict=True, ge=1)]


class DeliveryChargeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_cents: _Cents


class DishwareAdditionalLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(max_length=_MAX_DESCRIPTION_LEN)
    quantity: _PositiveQuantity
    unit_net_cents: _Cents

    @field_validator("description")
    @classmethod
    def _description_trimmed_and_nonempty(cls, value: str) -> str:
        if value != value.strip():
            raise ValueError(
                "description must be trimmed (no leading/trailing whitespace)"
            )
        if not value:
            raise ValueError("description is required")
        return value


class DishwareChargeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_mode: ChargeBaseMode
    pauschale_per_person_cents: _Cents
    additional_lines: list[DishwareAdditionalLineIn] = Field(
        default_factory=list, max_length=_MAX_ADDITIONAL_LINES
    )


class BuffetChargeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_mode: ChargeBaseMode
    pauschale_per_person_cents: _Cents


class ChargesDefinitionIn(BaseModel):
    """Complete, explicit charge configuration — all three sections are
    required whenever ``charges_definition`` is sent at all, matching Core's
    "no partial shape" rule exactly."""

    model_config = ConfigDict(extra="forbid")

    delivery: DeliveryChargeIn
    dishware: DishwareChargeIn
    buffet: BuffetChargeIn
