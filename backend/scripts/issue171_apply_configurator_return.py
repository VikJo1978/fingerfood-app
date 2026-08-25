from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:80]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def append_once(path: str, marker: str, addition: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if addition.strip() in text:
        raise RuntimeError(f"{path}: addition already present")
    if marker not in text:
        raise RuntimeError(f"{path}: marker missing")
    target.write_text(text + addition, encoding="utf-8")


# Backend request model mirrors Core #171.
replace_once(
    "backend/app/models/charges_definition.py",
    "from pydantic import BaseModel, ConfigDict, Field, field_validator\n\nChargeBaseMode = Literal[\"NONE\", \"PAUSCHALE\"]\n",
    "from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator\n\nChargeBaseMode = Literal[\"NONE\", \"PAUSCHALE\"]\nReturnMode = Literal[\"NEXT_WORKING_DAY\", \"SAME_DAY\"]\n",
)
replace_once(
    "backend/app/models/charges_definition.py",
    "class ChargesDefinitionIn(BaseModel):\n    \"\"\"Complete, explicit charge configuration — all three sections are\n    required whenever ``charges_definition`` is sent at all, matching Core's\n    \"no partial shape\" rule exactly.\"\"\"\n\n    model_config = ConfigDict(extra=\"forbid\")\n\n    delivery: DeliveryChargeIn\n    dishware: DishwareChargeIn\n    buffet: BuffetChargeIn\n",
    "class ReturnLogisticsIn(BaseModel):\n    model_config = ConfigDict(extra=\"forbid\")\n\n    mode: ReturnMode = \"NEXT_WORKING_DAY\"\n    pickup_window_text: str | None = Field(default=None, max_length=_MAX_DESCRIPTION_LEN)\n    same_day_fee_cents: _Cents = 0\n\n    @field_validator(\"pickup_window_text\")\n    @classmethod\n    def _pickup_window_trimmed_and_nonempty(\n        cls, value: str | None\n    ) -> str | None:\n        if value is None:\n            return None\n        if value != value.strip():\n            raise ValueError(\"pickup_window_text must be trimmed\")\n        if not value:\n            raise ValueError(\"pickup_window_text must not be empty\")\n        return value\n\n    @model_validator(mode=\"after\")\n    def _mode_consistency(self) -> \"ReturnLogisticsIn\":\n        if self.mode == \"SAME_DAY\" and self.pickup_window_text is None:\n            raise ValueError(\"SAME_DAY return requires pickup_window_text\")\n        if self.mode == \"NEXT_WORKING_DAY\" and self.pickup_window_text is not None:\n            raise ValueError(\n                \"NEXT_WORKING_DAY return must not specify pickup_window_text\"\n            )\n        return self\n\n\nclass ChargesDefinitionIn(BaseModel):\n    \"\"\"Complete explicit charge configuration accepted from Configurator.\n\n    ``return_logistics`` defaults to NEXT_WORKING_DAY so callers created before\n    issue #171 remain valid while new producers send the section explicitly.\n    \"\"\"\n\n    model_config = ConfigDict(extra=\"forbid\")\n\n    delivery: DeliveryChargeIn\n    dishware: DishwareChargeIn\n    buffet: BuffetChargeIn\n    return_logistics: ReturnLogisticsIn = Field(default_factory=ReturnLogisticsIn)\n",
)

# Backend snapshot materializes exactly one customer-visible fee for SAME_DAY.
replace_once(
    "backend/app/services/offer_snapshot_service.py",
    "from app.models.charges_definition import ChargesDefinitionIn, DishwareAdditionalLineIn\n",
    "from app.models.charges_definition import (\n    ChargesDefinitionIn,\n    DishwareAdditionalLineIn,\n    ReturnLogisticsIn,\n)\n",
)
replace_once(
    "backend/app/services/offer_snapshot_service.py",
    "def _build_charges_definition_positions(\n    charges: ChargesDefinitionIn, *, guest_count: int | None\n) -> list[dict[str, object]]:\n",
    "def _build_return_pickup_position(\n    return_logistics: ReturnLogisticsIn,\n) -> dict[str, object]:\n    amount = return_logistics.same_day_fee_cents\n    return _build_charge_position(\n        kind=\"fee\",\n        name=\"Rückholung am Veranstaltungstag\",\n        quantity_mode=\"total\",\n        quantity=\"1\",\n        unit_label=\"Pauschale\",\n        unit_net_cents=amount,\n        net_total_cents=amount,\n        vat_rate_percent=PAUSCHALEN_VAT_RATE_PERCENT,\n    )\n\n\ndef _build_charges_definition_positions(\n    charges: ChargesDefinitionIn, *, guest_count: int | None\n) -> list[dict[str, object]]:\n",
)
replace_once(
    "backend/app/services/offer_snapshot_service.py",
    "    if charges.buffet.base_mode == \"PAUSCHALE\":\n        assert guest_count is not None\n        positions.append(_build_buffet_position(charges, guest_count=guest_count))\n\n    return positions\n",
    "    if charges.buffet.base_mode == \"PAUSCHALE\":\n        assert guest_count is not None\n        positions.append(_build_buffet_position(charges, guest_count=guest_count))\n    if charges.return_logistics.mode == \"SAME_DAY\":\n        positions.append(_build_return_pickup_position(charges.return_logistics))\n\n    return positions\n",
)

# Backend focused contract tests reuse the existing fixture helpers in the same file.
append_once(
    "backend/tests/test_offer_snapshot_charges.py",
    "def test_both_none_materializes_only_delivery",
    r'''

# --- issue #171: reusable dishware/equipment return ---------------------------------


def test_next_working_day_return_adds_no_separate_fee(tmp_path: Path) -> None:
    charges = _charges()
    charges["return_logistics"] = {
        "mode": "NEXT_WORKING_DAY",
        "pickup_window_text": None,
        "same_day_fee_cents": 4500,
    }
    snapshot = _build(tmp_path, charges_definition=charges)
    returns = [
        position
        for position in _positions(snapshot)
        if position["kind"] == "fee"
        and position["name"] == "Rückholung am Veranstaltungstag"
    ]
    assert returns == []


def test_same_day_return_materializes_exact_fee_and_totals(tmp_path: Path) -> None:
    charges = _charges()
    charges["return_logistics"] = {
        "mode": "SAME_DAY",
        "pickup_window_text": "22:00-23:00",
        "same_day_fee_cents": 4500,
    }
    snapshot = _build(tmp_path, charges_definition=charges)
    returns = [
        position
        for position in _positions(snapshot)
        if position["kind"] == "fee"
        and position["name"] == "Rückholung am Veranstaltungstag"
    ]
    assert len(returns) == 1
    assert returns[0]["quantity_mode"] == "total"
    assert returns[0]["quantity"] == "1"
    assert returns[0]["unit_net_cents"] == 4500
    assert returns[0]["net_total_cents"] == 4500
    variants = cast(list[dict[str, object]], snapshot["variants"])
    totals = cast(dict[str, int], variants[0]["totals"])
    assert totals["net_cents"] == sum(
        cast(int, position["net_total_cents"]) for position in _positions(snapshot)
    )


def test_same_day_return_requires_pickup_window(tmp_path: Path) -> None:
    charges = _charges()
    charges["return_logistics"] = {
        "mode": "SAME_DAY",
        "pickup_window_text": None,
        "same_day_fee_cents": 4500,
    }
    with pytest.raises(ValueError, match="SAME_DAY return requires pickup_window_text"):
        _build(tmp_path, charges_definition=charges)


def test_next_working_day_return_rejects_pickup_window(tmp_path: Path) -> None:
    charges = _charges()
    charges["return_logistics"] = {
        "mode": "NEXT_WORKING_DAY",
        "pickup_window_text": "22:00-23:00",
        "same_day_fee_cents": 4500,
    }
    with pytest.raises(
        ValueError, match="NEXT_WORKING_DAY return must not specify pickup_window_text"
    ):
        _build(tmp_path, charges_definition=charges)
''',
)

# Frontend domain shape and safe defaults. Optional returnLogistics exists only for
# restoring/handling drafts written before issue #171; all fresh drafts include it.
replace_once(
    "frontend/src/types/index.ts",
    'export type ChargeBaseMode = "NONE" | "PAUSCHALE";\n',
    'export type ChargeBaseMode = "NONE" | "PAUSCHALE";\nexport type ReturnMode = "NEXT_WORKING_DAY" | "SAME_DAY";\n',
)
replace_once(
    "frontend/src/types/index.ts",
    "export interface ChargesDefinition {\n",
    "export interface ReturnLogisticsDefinition {\n  mode: ReturnMode;\n  pickupWindowText: string | null;\n  sameDayFeeCents: number;\n}\n\nexport interface ChargesDefinition {\n",
)
replace_once(
    "frontend/src/types/index.ts",
    "  dishware: {\n    baseMode: ChargeBaseMode;\n    pauschalePerPersonCents: number;\n    additionalLines: DishwareAdditionalLine[];\n  };\n}\n",
    "  dishware: {\n    baseMode: ChargeBaseMode;\n    pauschalePerPersonCents: number;\n    additionalLines: DishwareAdditionalLine[];\n  };\n  /** Optional only while restoring drafts created before issue #171. */\n  returnLogistics?: ReturnLogisticsDefinition;\n}\n",
)
replace_once(
    "frontend/src/types/index.ts",
    "export function createInitialOfferDraft(): OfferDraft {\n",
    "export function createInitialReturnLogisticsDefinition(): ReturnLogisticsDefinition {\n  return {\n    mode: \"NEXT_WORKING_DAY\",\n    pickupWindowText: null,\n    sameDayFeeCents: 0,\n  };\n}\n\nexport function createInitialOfferDraft(): OfferDraft {\n",
)
replace_once(
    "frontend/src/types/index.ts",
    "    dishware: {\n      baseMode: \"NONE\",\n      pauschalePerPersonCents: 200,\n      additionalLines: [],\n    },\n  };\n}\n",
    "    dishware: {\n      baseMode: \"NONE\",\n      pauschalePerPersonCents: 200,\n      additionalLines: [],\n    },\n    returnLogistics: createInitialReturnLogisticsDefinition(),\n  };\n}\n",
)

# Frontend -> backend/Core wire mapper.
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    'import { createInitialDeliveryFulfillmentDefinition } from "../types";\n',
    'import {\n  createInitialDeliveryFulfillmentDefinition,\n  createInitialReturnLogisticsDefinition,\n} from "../types";\n',
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    "  buffet: {\n    base_mode: \"NONE\" | \"PAUSCHALE\";\n    pauschale_per_person_cents: number;\n  };\n}\n",
    "  buffet: {\n    base_mode: \"NONE\" | \"PAUSCHALE\";\n    pauschale_per_person_cents: number;\n  };\n  return_logistics: {\n    mode: \"NEXT_WORKING_DAY\" | \"SAME_DAY\";\n    pickup_window_text: string | null;\n    same_day_fee_cents: number;\n  };\n}\n",
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    "  const current = normalizedFulfillment(charges);\n  return {\n",
    "  const current = normalizedFulfillment(charges);\n  const returnLogistics =\n    charges.returnLogistics ?? createInitialReturnLogisticsDefinition();\n  return {\n",
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    "    buffet: {\n      base_mode: charges.buffet.baseMode,\n      pauschale_per_person_cents: charges.buffet.pauschalePerPersonCents,\n    },\n  };\n}\n",
    "    buffet: {\n      base_mode: charges.buffet.baseMode,\n      pauschale_per_person_cents: charges.buffet.pauschalePerPersonCents,\n    },\n    return_logistics: {\n      mode: returnLogistics.mode,\n      pickup_window_text:\n        returnLogistics.mode === \"SAME_DAY\"\n          ? returnLogistics.pickupWindowText?.trim() || null\n          : null,\n      same_day_fee_cents: returnLogistics.sameDayFeeCents,\n    },\n  };\n}\n",
)

# Draft persistence accepts pre-#171 charges and normalizes them on read.
replace_once(
    "frontend/src/utils/draftPersistence.ts",
    'import { createInitialChargesDefinition } from "../types";\n',
    'import {\n  createInitialChargesDefinition,\n  createInitialReturnLogisticsDefinition,\n} from "../types";\n',
)
replace_once(
    "frontend/src/utils/draftPersistence.ts",
    "function isChargesDefinition(value: unknown): value is ChargesDefinition {\n",
    "function isReturnLogisticsDefinition(value: unknown): boolean {\n  if (!isRecord(value)) return false;\n  if (value.mode !== \"NEXT_WORKING_DAY\" && value.mode !== \"SAME_DAY\") return false;\n  if (!isNonnegativeInteger(value.sameDayFeeCents)) return false;\n  if (value.mode === \"SAME_DAY\") {\n    return (\n      isNonEmptyString(value.pickupWindowText, 500) &&\n      value.pickupWindowText === value.pickupWindowText.trim()\n    );\n  }\n  return value.pickupWindowText === null;\n}\n\nfunction isChargesDefinition(value: unknown): value is ChargesDefinition {\n",
)
replace_once(
    "frontend/src/utils/draftPersistence.ts",
    "  if (!Array.isArray(value.dishware.additionalLines)) return false;\n  return value.dishware.additionalLines.every(isDishwareAdditionalLine);\n}\n",
    "  if (!Array.isArray(value.dishware.additionalLines)) return false;\n  if (\n    value.returnLogistics !== undefined &&\n    !isReturnLogisticsDefinition(value.returnLogistics)\n  ) {\n    return false;\n  }\n  return value.dishware.additionalLines.every(isDishwareAdditionalLine);\n}\n",
)
replace_once(
    "frontend/src/utils/draftPersistence.ts",
    "  const draft = parsed.draft;\n  return {\n    ...draft,\n    ...normalizeBudgetDefinition(draft),\n    chargesDefinition: draft.chargesDefinition ?? createInitialChargesDefinition(),\n  };\n}\n",
    "  const draft = parsed.draft;\n  const chargesDefinition = draft.chargesDefinition ?? createInitialChargesDefinition();\n  return {\n    ...draft,\n    ...normalizeBudgetDefinition(draft),\n    chargesDefinition: {\n      ...chargesDefinition,\n      returnLogistics:\n        chargesDefinition.returnLogistics ?? createInitialReturnLogisticsDefinition(),\n    },\n  };\n}\n",
)

# Totals/VAT include the SAME_DAY fee, but NEXT_WORKING_DAY remains included in normal tariff.
replace_once(
    "frontend/src/utils/pricing.ts",
    "  dishwareAdditional: number;\n  grandTotal: number;\n",
    "  dishwareAdditional: number;\n  /** Separate net surcharge only for SAME_DAY return. */\n  returnPickup?: number;\n  grandTotal: number;\n",
)
replace_once(
    "frontend/src/utils/pricing.ts",
    "  dishwareAdditionalCents: number;\n  totalCents: number;\n",
    "  dishwareAdditionalCents: number;\n  returnPickupCents: number;\n  totalCents: number;\n",
)
replace_once(
    "frontend/src/utils/pricing.ts",
    "  const dishwareAdditionalCents = additionalDishwareCents(charges.dishware.additionalLines);\n  return {\n",
    "  const dishwareAdditionalCents = additionalDishwareCents(charges.dishware.additionalLines);\n  const returnPickupCents =\n    charges.returnLogistics?.mode === \"SAME_DAY\"\n      ? charges.returnLogistics.sameDayFeeCents\n      : 0;\n  return {\n",
)
replace_once(
    "frontend/src/utils/pricing.ts",
    "    dishwareAdditionalCents,\n    totalCents: buffetCents + dishwarePauschaleCents + deliveryCents + dishwareAdditionalCents,\n",
    "    dishwareAdditionalCents,\n    returnPickupCents,\n    totalCents:\n      buffetCents +\n      dishwarePauschaleCents +\n      deliveryCents +\n      dishwareAdditionalCents +\n      returnPickupCents,\n",
)
replace_once(
    "frontend/src/utils/pricing.ts",
    "      dishwareAdditional: centsToEuros(c.dishwareAdditionalCents),\n      grandTotal: Math.round((subtotal + centsToEuros(c.totalCents)) * 100) / 100,\n",
    "      dishwareAdditional: centsToEuros(c.dishwareAdditionalCents),\n      returnPickup: centsToEuros(c.returnPickupCents),\n      grandTotal: Math.round((subtotal + centsToEuros(c.totalCents)) * 100) / 100,\n",
)
replace_once(
    "frontend/src/utils/pricing.ts",
    "      dishwareAdditional: 0,\n      grandTotal: 0,\n",
    "      dishwareAdditional: 0,\n      returnPickup: 0,\n      grandTotal: 0,\n",
)
replace_once(
    "frontend/src/utils/pricing.ts",
    "  return { buffetpauschale, geschirrpauschale, anlieferung, dishwareAdditional: 0, grandTotal };\n",
    "  return {\n    buffetpauschale,\n    geschirrpauschale,\n    anlieferung,\n    dishwareAdditional: 0,\n    returnPickup: 0,\n    grandTotal,\n  };\n",
)
replace_once(
    "frontend/src/utils/pricing.ts",
    "    pauschalen.anlieferung +\n    pauschalen.dishwareAdditional;\n",
    "    pauschalen.anlieferung +\n    pauschalen.dishwareAdditional +\n    (pauschalen.returnPickup ?? 0);\n",
)

# Configurator modal: mode, required pickup window and operator-configured net surcharge.
replace_once(
    "frontend/src/components/summary/ChargeConfiguratorModal.tsx",
    'import type { ChargesDefinition, DishwareAdditionalLine } from "../../types";\n',
    'import {\n  createInitialReturnLogisticsDefinition,\n  type ChargesDefinition,\n  type DishwareAdditionalLine,\n} from "../../types";\n',
)
replace_once(
    "frontend/src/components/summary/ChargeConfiguratorModal.tsx",
    "  const hasPersons = validPersons(persons);\n",
    "  const hasPersons = validPersons(persons);\n  const returnLogistics =\n    charges.returnLogistics ?? createInitialReturnLogisticsDefinition();\n",
)
replace_once(
    "frontend/src/components/summary/ChargeConfiguratorModal.tsx",
    "          <section className=\"grid gap-3\">\n            <div className=\"flex flex-wrap items-end justify-between gap-3\">\n              <label className=\"grid gap-1.5\">\n                <span className={labelClass}>Geschirr</span>\n",
    "          <section className=\"grid gap-3 border-b border-line pb-5\">\n            <label className=\"grid gap-1.5\">\n              <span className={labelClass}>Rückholung</span>\n              <select\n                aria-label=\"Rückholmodus\"\n                value={returnLogistics.mode}\n                onChange={(e) => {\n                  const mode = e.target.value as typeof returnLogistics.mode;\n                  onChange({\n                    ...charges,\n                    returnLogistics: {\n                      ...returnLogistics,\n                      mode,\n                      pickupWindowText:\n                        mode === \"SAME_DAY\" ? returnLogistics.pickupWindowText : null,\n                    },\n                  });\n                }}\n                className={selectClass}\n              >\n                <option value=\"NEXT_WORKING_DAY\">Nächster Werktag</option>\n                <option value=\"SAME_DAY\">Am Veranstaltungstag</option>\n              </select>\n            </label>\n            {returnLogistics.mode === \"SAME_DAY\" ? (\n              <>\n                <label className=\"grid gap-1.5\">\n                  <span className={labelClass}>Abholfenster</span>\n                  <input\n                    aria-label=\"Abholfenster Rückholung\"\n                    type=\"text\"\n                    maxLength={DESCRIPTION_MAX}\n                    placeholder=\"z. B. 22:00–23:00\"\n                    value={returnLogistics.pickupWindowText ?? \"\"}\n                    onChange={(e) =>\n                      onChange({\n                        ...charges,\n                        returnLogistics: {\n                          ...returnLogistics,\n                          pickupWindowText: e.target.value.slice(0, DESCRIPTION_MAX),\n                        },\n                      })\n                    }\n                    onBlur={(e) =>\n                      onChange({\n                        ...charges,\n                        returnLogistics: {\n                          ...returnLogistics,\n                          pickupWindowText: e.currentTarget.value.trim() || null,\n                        },\n                      })\n                    }\n                    className={moneyClass}\n                  />\n                  {returnLogistics.pickupWindowText?.trim() ? null : (\n                    <span className=\"text-xs font-semibold text-danger\" role=\"alert\">\n                      Abholfenster für Rückholung am Veranstaltungstag erforderlich.\n                    </span>\n                  )}\n                </label>\n                <MoneyField\n                  label=\"Aufpreis Rückholung netto\"\n                  valueCents={returnLogistics.sameDayFeeCents}\n                  onValidChange={(sameDayFeeCents) =>\n                    onChange({\n                      ...charges,\n                      returnLogistics: { ...returnLogistics, sameDayFeeCents },\n                    })\n                  }\n                />\n                <p className=\"text-xs text-muted\">\n                  Die Rückholung am selben Tag wird als eigene Position im Angebot berechnet.\n                </p>\n              </>\n            ) : (\n              <p className=\"text-xs text-muted\">\n                Rückholung am nächsten Werktag ist durch den normalen Liefer-/Servicetarif abgedeckt.\n              </p>\n            )}\n          </section>\n\n          <section className=\"grid gap-3\">\n            <div className=\"flex flex-wrap items-end justify-between gap-3\">\n              <label className=\"grid gap-1.5\">\n                <span className={labelClass}>Geschirr</span>\n",
)

# Summary displays and validates SAME_DAY request before prepare.
replace_once(
    "frontend/src/components/summary/OfferSummary.tsx",
    "  const chargeBlocksPrepare = pauschaleNeedsPersons || invalidDishwareLines;\n",
    "  const returnLogistics = draft.chargesDefinition.returnLogistics;\n  const invalidReturnLogistics =\n    returnLogistics?.mode === \"SAME_DAY\" &&\n    (returnLogistics.pickupWindowText?.trim() === \"\" ||\n      returnLogistics.pickupWindowText == null ||\n      !Number.isInteger(returnLogistics.sameDayFeeCents) ||\n      returnLogistics.sameDayFeeCents < 0);\n  const chargeBlocksPrepare =\n    pauschaleNeedsPersons || invalidDishwareLines || invalidReturnLogistics;\n",
)
replace_once(
    "frontend/src/components/summary/OfferSummary.tsx",
    "          <ChargeSummaryRow\n            label=\"Anlieferung\"\n            amount={pauschalen.anlieferung}\n            onEdit={() => setChargesOpen(true)}\n          />\n",
    "          <ChargeSummaryRow\n            label=\"Anlieferung\"\n            amount={pauschalen.anlieferung}\n            onEdit={() => setChargesOpen(true)}\n          />\n          {returnLogistics?.mode === \"SAME_DAY\" ? (\n            <ChargeSummaryRow\n              label=\"Rückholung am Veranstaltungstag\"\n              amount={pauschalen.returnPickup ?? 0}\n              onEdit={() => setChargesOpen(true)}\n            />\n          ) : null}\n",
)

# Customer-facing preview includes requested mode/window and the priced SAME_DAY row.
replace_once(
    "frontend/src/components/summary/OfferPreview.tsx",
    "          <section className=\"grid gap-1 text-sm sm:grid-cols-2\">\n            <p>\n              <span className=\"text-slate-500\">Anlieferung: </span>\n              <span className=\"font-medium text-slate-900\">\n                {oc.eventTime ? `${oc.eventTime}, ` : \"\"}\n                {dashIfEmpty(oc.location)}\n              </span>\n            </p>\n          </section>\n",
    "          <section className=\"grid gap-1 text-sm sm:grid-cols-2\">\n            <p>\n              <span className=\"text-slate-500\">Anlieferung: </span>\n              <span className=\"font-medium text-slate-900\">\n                {oc.eventTime ? `${oc.eventTime}, ` : \"\"}\n                {dashIfEmpty(oc.location)}\n              </span>\n            </p>\n            <p>\n              <span className=\"text-slate-500\">Rückholung: </span>\n              <span className=\"font-medium text-slate-900\">\n                {draft.chargesDefinition.returnLogistics?.mode === \"SAME_DAY\"\n                  ? `Am Veranstaltungstag, ${draft.chargesDefinition.returnLogistics.pickupWindowText ?? \"—\"}`\n                  : \"Nächster Werktag\"}\n              </span>\n            </p>\n          </section>\n",
)
replace_once(
    "frontend/src/components/summary/OfferPreview.tsx",
    "                {pauschalen.anlieferung >= 0 ? (\n                  <tr className=\"border-b border-slate-200 text-slate-700\">\n                    <td className=\"py-2 pr-2\">1 Pauschale</td>\n                    <td className=\"py-2 pr-2\">Anlieferung (Standardzone)</td>\n                    <td className=\"py-2 pr-2 text-right\">\n                      {formatCurrency(pauschalen.anlieferung)}\n                    </td>\n                    <td className=\"py-2 pl-2 text-right font-semibold\">\n                      {formatCurrency(pauschalen.anlieferung)}\n                    </td>\n                  </tr>\n                ) : null}\n",
    "                {pauschalen.anlieferung >= 0 ? (\n                  <tr className=\"border-b border-slate-200 text-slate-700\">\n                    <td className=\"py-2 pr-2\">1 Pauschale</td>\n                    <td className=\"py-2 pr-2\">Anlieferung (Standardzone)</td>\n                    <td className=\"py-2 pr-2 text-right\">\n                      {formatCurrency(pauschalen.anlieferung)}\n                    </td>\n                    <td className=\"py-2 pl-2 text-right font-semibold\">\n                      {formatCurrency(pauschalen.anlieferung)}\n                    </td>\n                  </tr>\n                ) : null}\n                {draft.chargesDefinition.returnLogistics?.mode === \"SAME_DAY\" ? (\n                  <tr className=\"border-b border-slate-200 text-slate-700\">\n                    <td className=\"py-2 pr-2\">1 Pauschale</td>\n                    <td className=\"py-2 pr-2\">\n                      Rückholung am Veranstaltungstag\n                      <span className=\"block text-xs text-slate-500\">\n                        {draft.chargesDefinition.returnLogistics.pickupWindowText}\n                      </span>\n                    </td>\n                    <td className=\"py-2 pr-2 text-right\">\n                      {formatCurrency(pauschalen.returnPickup ?? 0)}\n                    </td>\n                    <td className=\"py-2 pl-2 text-right font-semibold\">\n                      {formatCurrency(pauschalen.returnPickup ?? 0)}\n                    </td>\n                  </tr>\n                ) : null}\n",
)

# Focused frontend contract tests.
frontend_test = ROOT / "frontend/src/utils/__tests__/issue171ReturnLogistics.test.ts"
if frontend_test.exists():
    raise RuntimeError(f"{frontend_test}: already exists")
frontend_test.write_text(
    r'''import { describe, expect, it } from "vitest";
import {
  createInitialChargesDefinition,
  createInitialOfferDraft,
} from "../../types";
import { computeChargesCents } from "../pricing";
import { buildChargesDefinition } from "../offerSnapshotRequest";
import {
  draftStorageKey,
  readDraftFromSession,
  type DraftPersistenceScope,
} from "../draftPersistence";

class FakeStorage implements Pick<Storage, "getItem" | "setItem"> {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const SCOPE: DraftPersistenceScope = { kind: "manual" };

describe("issue #171 return logistics", () => {
  it("defaults fresh drafts to next working day without a separate fee", () => {
    const charges = createInitialChargesDefinition();
    expect(charges.returnLogistics).toEqual({
      mode: "NEXT_WORKING_DAY",
      pickupWindowText: null,
      sameDayFeeCents: 0,
    });
    expect(computeChargesCents(charges, 20).returnPickupCents).toBe(0);
  });

  it("maps SAME_DAY to the Core wire contract and includes its fee in totals", () => {
    const charges = createInitialChargesDefinition();
    charges.returnLogistics = {
      mode: "SAME_DAY",
      pickupWindowText: "22:00–23:00",
      sameDayFeeCents: 4500,
    };
    expect(buildChargesDefinition(charges).return_logistics).toEqual({
      mode: "SAME_DAY",
      pickup_window_text: "22:00–23:00",
      same_day_fee_cents: 4500,
    });
    expect(computeChargesCents(charges, 20).returnPickupCents).toBe(4500);
  });

  it("keeps a configured same-day rate when NEXT_WORKING_DAY is selected but does not charge it", () => {
    const charges = createInitialChargesDefinition();
    charges.returnLogistics = {
      mode: "NEXT_WORKING_DAY",
      pickupWindowText: null,
      sameDayFeeCents: 4500,
    };
    expect(buildChargesDefinition(charges).return_logistics.same_day_fee_cents).toBe(4500);
    expect(computeChargesCents(charges, 20).returnPickupCents).toBe(0);
  });

  it("normalizes a pre-#171 persisted draft to NEXT_WORKING_DAY", () => {
    const storage = new FakeStorage();
    const draft = createInitialOfferDraft();
    delete draft.chargesDefinition.returnLogistics;
    storage.setItem(
      draftStorageKey(SCOPE),
      JSON.stringify({
        schema_version: "fingerfood.configurator-draft.v1",
        scope_key: draftStorageKey(SCOPE),
        saved_at: new Date().toISOString(),
        draft,
      })
    );
    const restored = readDraftFromSession(SCOPE, storage);
    expect(restored?.chargesDefinition.returnLogistics).toEqual({
      mode: "NEXT_WORKING_DAY",
      pickupWindowText: null,
      sameDayFeeCents: 0,
    });
  });
});
''',
    encoding="utf-8",
)

component_test = ROOT / "frontend/src/components/summary/__tests__/ChargeConfiguratorReturnLogistics.test.tsx"
if component_test.exists():
    raise RuntimeError(f"{component_test}: already exists")
component_test.write_text(
    r'''import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialChargesDefinition } from "../../../types";
import { ChargeConfiguratorModal } from "../ChargeConfiguratorModal";

describe("ChargeConfiguratorModal return logistics", () => {
  it("shows pickup window and surcharge only for SAME_DAY", () => {
    const onChange = vi.fn();
    const charges = createInitialChargesDefinition();
    const { rerender } = render(
      <ChargeConfiguratorModal
        open
        charges={charges}
        persons={20}
        onClose={() => undefined}
        onChange={onChange}
        createLineId={() => "line-1"}
      />
    );

    expect(screen.queryByLabelText("Abholfenster Rückholung")).toBeNull();
    fireEvent.change(screen.getByLabelText("Rückholmodus"), {
      target: { value: "SAME_DAY" },
    });
    expect(onChange).toHaveBeenCalled();

    const sameDay = {
      ...charges,
      returnLogistics: {
        mode: "SAME_DAY" as const,
        pickupWindowText: null,
        sameDayFeeCents: 0,
      },
    };
    rerender(
      <ChargeConfiguratorModal
        open
        charges={sameDay}
        persons={20}
        onClose={() => undefined}
        onChange={onChange}
        createLineId={() => "line-1"}
      />
    );
    expect(screen.getByLabelText("Abholfenster Rückholung")).toBeTruthy();
    expect(screen.getByText(/Abholfenster für Rückholung/)).toBeTruthy();
    expect(screen.getByText("Aufpreis Rückholung netto")).toBeTruthy();
  });
});
''',
    encoding="utf-8",
)

print("issue #171 configurator return logistics patch applied")
