from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"expected one match in {path}, got {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# --- frontend types -------------------------------------------------------
replace_once(
    "frontend/src/types/index.ts",
    '''  eventDate: string;\n  eventTime: string;\n  /** Veranstaltungsort. Delivery address is modeled separately below. */\n''',
    '''  eventDate: string;\n  eventTime: string;\n  /** Explicit machine-usable delivery timing. Never inferred from eventTime. */\n  deliveryDate?: string;\n  deliveryWindowStart?: string;\n  deliveryWindowEnd?: string;\n  /** Veranstaltungsort. Delivery address is modeled separately below. */\n''',
)
replace_once(
    "frontend/src/types/index.ts",
    '''export interface ReturnLogisticsDefinition {\n\tmode: ReturnMode;\n\tpickupWindowText: string | null;\n\tsameDayFeeCents: number;\n}\n''',
    '''export interface ReturnLogisticsDefinition {\n\tmode: ReturnMode;\n\tpickupWindowText: string | null;\n\tsameDayFeeCents: number;\n\t/** Optional canonical SAME_DAY pickup timing for logistics capacity. */\n\tpickupWindowStartLocal?: string;\n\tpickupWindowEndLocal?: string;\n}\n''',
)

# --- request mapping ------------------------------------------------------
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    '''  DeliveryFulfillmentDefinition,\n  OfferDraft,\n} from "../types";\n''',
    '''  DeliveryFulfillmentDefinition,\n  OfferDraft,\n  OrderContextV1,\n  ReturnLogisticsDefinition,\n} from "../types";\n''',
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    '''\treturn_logistics: {\n\t\tmode: "NEXT_WORKING_DAY" | "SAME_DAY";\n\t\tpickup_window_text: string | null;\n\t\tsame_day_fee_cents: number;\n\t};\n}\n''',
    '''\treturn_logistics: {\n\t\tmode: "NEXT_WORKING_DAY" | "SAME_DAY";\n\t\tpickup_window_text: string | null;\n\t\tsame_day_fee_cents: number;\n\t\tpickup_window_start_local?: string;\n\t\tpickup_window_end_local?: string;\n\t};\n}\n''',
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    '''function normalizedFulfillment(\n\tcharges: ChargesDefinition,\n): DeliveryFulfillmentDefinition {\n''',
    '''const CANONICAL_LOCAL_TIME_RE = /^(?:[01]\\d|2[0-3]):[0-5]\\d$/;\n\nfunction canonicalLocalTime(value: string | undefined): string {\n  const normalized = value?.trim() ?? "";\n  if (!CANONICAL_LOCAL_TIME_RE.test(normalized)) {\n    throw new Error("invalid_canonical_logistics_time");\n  }\n  return normalized;\n}\n\nfunction canonicalDeliveryTiming(\n  context: OrderContextV1,\n): Record<string, string> {\n  const serviceDate = context.deliveryDate?.trim() ?? "";\n  const start = context.deliveryWindowStart?.trim() ?? "";\n  const end = context.deliveryWindowEnd?.trim() ?? "";\n  const supplied = [serviceDate, start, end].filter(Boolean).length;\n  if (supplied === 0) return {};\n  if (supplied !== 3 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(serviceDate)) {\n    throw new Error("invalid_delivery_window");\n  }\n  const canonicalStart = canonicalLocalTime(start);\n  const canonicalEnd = canonicalLocalTime(end);\n  if (canonicalStart >= canonicalEnd) throw new Error("invalid_delivery_window");\n  return {\n    delivery_date_local: serviceDate,\n    delivery_window_start_local: canonicalStart,\n    delivery_window_end_local: canonicalEnd,\n  };\n}\n\nfunction canonicalReturnPickupTiming(\n  returnLogistics: ReturnLogisticsDefinition,\n): Record<string, string> {\n  const start = returnLogistics.pickupWindowStartLocal?.trim() ?? "";\n  const end = returnLogistics.pickupWindowEndLocal?.trim() ?? "";\n  const supplied = [start, end].filter(Boolean).length;\n  if (returnLogistics.mode === "NEXT_WORKING_DAY") {\n    if (supplied !== 0) throw new Error("invalid_return_pickup_window");\n    return {};\n  }\n  if (supplied === 0) return {};\n  if (supplied !== 2) throw new Error("invalid_return_pickup_window");\n  const canonicalStart = canonicalLocalTime(start);\n  const canonicalEnd = canonicalLocalTime(end);\n  if (canonicalStart >= canonicalEnd) {\n    throw new Error("invalid_return_pickup_window");\n  }\n  return {\n    pickup_window_start_local: canonicalStart,\n    pickup_window_end_local: canonicalEnd,\n  };\n}\n\nfunction normalizedFulfillment(\n\tcharges: ChargesDefinition,\n): DeliveryFulfillmentDefinition {\n''',
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    '''\tconst returnLogistics =\n\t\tcharges.returnLogistics ?? createInitialReturnLogisticsDefinition();\n  return {\n''',
    '''\tconst returnLogistics =\n\t\tcharges.returnLogistics ?? createInitialReturnLogisticsDefinition();\n  const canonicalPickup = canonicalReturnPickupTiming(returnLogistics);\n  return {\n''',
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    '''\t\t\tsame_day_fee_cents: returnLogistics.sameDayFeeCents,\n\t\t},\n''',
    '''\t\t\tsame_day_fee_cents: returnLogistics.sameDayFeeCents,\n      ...canonicalPickup,\n\t\t},\n''',
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    '''    planning_mode: "caterer_suggestion" | "self_select";\n  };\n''',
    '''    planning_mode: "caterer_suggestion" | "self_select";\n    delivery_date_local?: string;\n    delivery_window_start_local?: string;\n    delivery_window_end_local?: string;\n  };\n''',
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    '''  const budgetDefinition = buildBudgetDefinition(draft);\n  const guestCount = Math.round(draft.persons) || 0;\n  return {\n''',
    '''  const budgetDefinition = buildBudgetDefinition(draft);\n  const guestCount = Math.round(draft.persons) || 0;\n  const deliveryTiming = canonicalDeliveryTiming(ctx);\n  return {\n''',
)
replace_once(
    "frontend/src/utils/offerSnapshotRequest.ts",
    '''      planning_mode: "caterer_suggestion",\n    },\n''',
    '''      planning_mode: "caterer_suggestion",\n      ...deliveryTiming,\n    },\n''',
)

# --- draft persistence ----------------------------------------------------
replace_once(
    "frontend/src/utils/draftPersistence.ts",
    '''function isOrderContext(value: unknown): value is OrderContextV1 {\n''',
    '''const CANONICAL_LOCAL_TIME_RE = /^(?:[01]\\d|2[0-3]):[0-5]\\d$/;\n\nfunction isCanonicalOptionalWindow(\n  start: unknown,\n  end: unknown,\n): boolean {\n  if (start === undefined && end === undefined) return true;\n  if (typeof start !== "string" || typeof end !== "string") return false;\n  return (\n    CANONICAL_LOCAL_TIME_RE.test(start) &&\n    CANONICAL_LOCAL_TIME_RE.test(end) &&\n    start < end\n  );\n}\n\nfunction isOrderContext(value: unknown): value is OrderContextV1 {\n''',
)
replace_once(
    "frontend/src/utils/draftPersistence.ts",
    '''    typeof value.location === "string" &&\n    isOptionalString(value.email) &&\n''',
    '''    typeof value.location === "string" &&\n    isOptionalString(value.deliveryDate, 10) &&\n    isOptionalString(value.deliveryWindowStart, 5) &&\n    isOptionalString(value.deliveryWindowEnd, 5) &&\n    isCanonicalOptionalWindow(value.deliveryWindowStart, value.deliveryWindowEnd) &&\n    ((value.deliveryDate === undefined && value.deliveryWindowStart === undefined) ||\n      (typeof value.deliveryDate === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(value.deliveryDate))) &&\n    isOptionalString(value.email) &&\n''',
)
replace_once(
    "frontend/src/utils/draftPersistence.ts",
    '''\tif (!isNonnegativeInteger(value.sameDayFeeCents)) return false;\n\tif (value.mode === "SAME_DAY") {\n''',
    '''\tif (!isNonnegativeInteger(value.sameDayFeeCents)) return false;\n  if (!isCanonicalOptionalWindow(value.pickupWindowStartLocal, value.pickupWindowEndLocal)) {\n    return false;\n  }\n\tif (value.mode === "SAME_DAY") {\n''',
)
replace_once(
    "frontend/src/utils/draftPersistence.ts",
    '''\treturn value.pickupWindowText === null;\n}\n''',
    '''\treturn (\n    value.pickupWindowText === null &&\n    value.pickupWindowStartLocal === undefined &&\n    value.pickupWindowEndLocal === undefined\n  );\n}\n''',
)

# --- OrderContext UI ------------------------------------------------------
replace_once(
    "frontend/src/components/OrderContextCard.tsx",
    '''      </div>\n\n      {oc.billingAddress?.trim() ? (\n''',
    '''      </div>\n\n      <div className="mt-3 rounded-control border border-line bg-canvas px-3 py-3">\n        <div className="mb-2">\n          <span className={fieldLabelClass}>Lieferfenster · Logistikplanung</span>\n          <p className="mt-1 text-xs text-muted">\n            Strukturierte Zeitangabe für die Kapazitätsplanung. Leer lassen, wenn noch nicht festgelegt.\n            Das freie Feld „Uhrzeit / Zeitfenster“ oben wird daraus nicht automatisch abgeleitet.\n          </p>\n        </div>\n        <div className="grid gap-2.5 sm:grid-cols-3">\n          <label className="flex flex-col gap-1.5">\n            <span className={fieldLabelClass}>Lieferdatum</span>\n            <input\n              aria-label="Lieferdatum Logistik"\n              type="date"\n              value={oc.deliveryDate ?? ""}\n              onChange={(e) =>\n                onOrderContextChange({\n                  deliveryDate: e.target.value || undefined,\n                })\n              }\n              className={inputClass}\n            />\n          </label>\n          <label className="flex flex-col gap-1.5">\n            <span className={fieldLabelClass}>Von</span>\n            <input\n              aria-label="Lieferfenster von"\n              type="time"\n              value={oc.deliveryWindowStart ?? ""}\n              onChange={(e) =>\n                onOrderContextChange({\n                  deliveryWindowStart: e.target.value || undefined,\n                })\n              }\n              className={inputClass}\n            />\n          </label>\n          <label className="flex flex-col gap-1.5">\n            <span className={fieldLabelClass}>Bis</span>\n            <input\n              aria-label="Lieferfenster bis"\n              type="time"\n              value={oc.deliveryWindowEnd ?? ""}\n              onChange={(e) =>\n                onOrderContextChange({\n                  deliveryWindowEnd: e.target.value || undefined,\n                })\n              }\n              className={inputClass}\n            />\n          </label>\n        </div>\n      </div>\n\n      {oc.billingAddress?.trim() ? (\n''',
)

# --- Return logistics UI -------------------------------------------------
replace_once(
    "frontend/src/components/summary/ChargeConfiguratorModal.tsx",
    '''\t\t\t\t\t\t\tpickupWindowText:\n\t\t\t\t\t\t\t\tmode === "SAME_DAY"\n\t\t\t\t\t\t\t\t\t? returnLogistics.pickupWindowText\n\t\t\t\t\t\t\t\t\t: null,\n''',
    '''\t\t\t\t\t\t\tpickupWindowText:\n\t\t\t\t\t\t\t\tmode === "SAME_DAY"\n\t\t\t\t\t\t\t\t\t? returnLogistics.pickupWindowText\n\t\t\t\t\t\t\t\t\t: null,\n                pickupWindowStartLocal:\n                  mode === "SAME_DAY" ? returnLogistics.pickupWindowStartLocal : undefined,\n                pickupWindowEndLocal:\n                  mode === "SAME_DAY" ? returnLogistics.pickupWindowEndLocal : undefined,\n''',
)
replace_once(
    "frontend/src/components/summary/ChargeConfiguratorModal.tsx",
    '''\t\t\t\t\t\t\t\t</label>\n\t\t\t\t\t\t\t\t<MoneyField\n''',
    '''\t\t\t\t\t\t\t\t</label>\n                <div className="grid gap-2 sm:grid-cols-2">\n                  <label className="grid gap-1.5">\n                    <span className={labelClass}>Abholung von · optional</span>\n                    <input\n                      aria-label="Abholung Rückholung von"\n                      type="time"\n                      value={returnLogistics.pickupWindowStartLocal ?? ""}\n                      onChange={(e) =>\n                        onChange({\n                          ...charges,\n                          returnLogistics: {\n                            ...returnLogistics,\n                            pickupWindowStartLocal: e.target.value || undefined,\n                          },\n                        })\n                      }\n                      className={moneyClass}\n                    />\n                  </label>\n                  <label className="grid gap-1.5">\n                    <span className={labelClass}>Abholung bis · optional</span>\n                    <input\n                      aria-label="Abholung Rückholung bis"\n                      type="time"\n                      value={returnLogistics.pickupWindowEndLocal ?? ""}\n                      onChange={(e) =>\n                        onChange({\n                          ...charges,\n                          returnLogistics: {\n                            ...returnLogistics,\n                            pickupWindowEndLocal: e.target.value || undefined,\n                          },\n                        })\n                      }\n                      className={moneyClass}\n                    />\n                  </label>\n                </div>\n                <p className="text-xs text-muted">\n                  Die strukturierte Von/Bis-Zeit ist nur für die Logistik-Kapazitätsplanung.\n                  Leer bedeutet: Zeitpunkt noch unbekannt.\n                </p>\n\t\t\t\t\t\t\t\t<MoneyField\n''',
)

# --- Prepare-time structural validation ---------------------------------
replace_once(
    "frontend/src/pages/HomePage.tsx",
    '''    if (offerDraft.lines.length === 0) {\n''',
    '''    const deliveryTiming = [\n      offerDraft.orderContext.deliveryDate?.trim() ?? "",\n      offerDraft.orderContext.deliveryWindowStart?.trim() ?? "",\n      offerDraft.orderContext.deliveryWindowEnd?.trim() ?? "",\n    ];\n    const deliveryTimingCount = deliveryTiming.filter(Boolean).length;\n    if (deliveryTimingCount !== 0 && deliveryTimingCount !== 3) {\n      setPrepareStatus("error");\n      setPrepareMessage("Lieferfenster bitte vollständig mit Datum, Von und Bis angeben oder leer lassen.");\n      return;\n    }\n    if (deliveryTimingCount === 3 && deliveryTiming[1] >= deliveryTiming[2]) {\n      setPrepareStatus("error");\n      setPrepareMessage("Beim Lieferfenster muss Von vor Bis liegen.");\n      return;\n    }\n    const returnLogistics = offerDraft.chargesDefinition.returnLogistics;\n    if (returnLogistics?.mode === "SAME_DAY") {\n      const pickupStart = returnLogistics.pickupWindowStartLocal?.trim() ?? "";\n      const pickupEnd = returnLogistics.pickupWindowEndLocal?.trim() ?? "";\n      if (Boolean(pickupStart) !== Boolean(pickupEnd)) {\n        setPrepareStatus("error");\n        setPrepareMessage("Strukturiertes Rückholfenster bitte mit Von und Bis vollständig angeben oder leer lassen.");\n        return;\n      }\n      if (pickupStart && pickupEnd && pickupStart >= pickupEnd) {\n        setPrepareStatus("error");\n        setPrepareMessage("Beim strukturierten Rückholfenster muss Von vor Bis liegen.");\n        return;\n      }\n    }\n    if (offerDraft.lines.length === 0) {\n''',
)

# --- backend local validation --------------------------------------------
replace_once(
    "backend/app/models/charges_definition.py",
    '''from __future__ import annotations\n\nfrom typing import Annotated, Literal\n''',
    '''from __future__ import annotations\n\nimport re\nfrom typing import Annotated, Literal\n''',
)
replace_once(
    "backend/app/models/charges_definition.py",
    '''_MAX_ADDITIONAL_LINES = 100\n\n_Cents = Annotated[int, Field(strict=True, ge=0)]\n''',
    '''_MAX_ADDITIONAL_LINES = 100\n_CANONICAL_LOCAL_TIME_RE = re.compile(r"^(?:[01]\\d|2[0-3]):[0-5]\\d$")\n\n_Cents = Annotated[int, Field(strict=True, ge=0)]\n''',
)
replace_once(
    "backend/app/models/charges_definition.py",
    '''    same_day_fee_cents: _Cents = 0\n\n    @field_validator("pickup_window_text")\n''',
    '''    same_day_fee_cents: _Cents = 0\n    pickup_window_start_local: str | None = None\n    pickup_window_end_local: str | None = None\n\n    @field_validator("pickup_window_text")\n''',
)
replace_once(
    "backend/app/models/charges_definition.py",
    '''        return value\n\n    @model_validator(mode="after")\n''',
    '''        return value\n\n    @field_validator("pickup_window_start_local", "pickup_window_end_local")\n    @classmethod\n    def _canonical_pickup_time(cls, value: str | None) -> str | None:\n        if value is None:\n            return None\n        if not _CANONICAL_LOCAL_TIME_RE.fullmatch(value):\n            raise ValueError("canonical pickup time must be HH:MM")\n        return value\n\n    @model_validator(mode="after")\n''',
)
replace_once(
    "backend/app/models/charges_definition.py",
    '''        if self.mode == "NEXT_WORKING_DAY" and self.pickup_window_text is not None:\n            raise ValueError(\n                "NEXT_WORKING_DAY return must not specify pickup_window_text"\n            )\n        return self\n''',
    '''        if (self.pickup_window_start_local is None) != (\n            self.pickup_window_end_local is None\n        ):\n            raise ValueError("canonical pickup window requires start and end")\n        if (\n            self.pickup_window_start_local is not None\n            and self.pickup_window_end_local is not None\n            and self.pickup_window_start_local >= self.pickup_window_end_local\n        ):\n            raise ValueError("canonical pickup window start must be before end")\n        if self.mode == "NEXT_WORKING_DAY":\n            if self.pickup_window_text is not None:\n                raise ValueError(\n                    "NEXT_WORKING_DAY return must not specify pickup_window_text"\n                )\n            if self.pickup_window_start_local is not None:\n                raise ValueError(\n                    "NEXT_WORKING_DAY return must not specify canonical pickup time"\n                )\n        return self\n''',
)

# --- CI contract pin ------------------------------------------------------
replace_once(
    ".github/workflows/ci.yml",
    '''      # Cross-repository contract: pin to the exact merged Core commit that\n      # provides both recommendation-demand and recommendation-capacity for\n      # issue #151/#162. Never use a moving branch here; bump deliberately\n      # when the approved Core contract changes.\n''',
    '''      # Cross-repository contract: pin to the exact merged Core commit that\n      # includes the accepted canonical logistics timing contract from #175.\n      # Never use a moving branch here; bump deliberately when the approved\n      # Core contract changes.\n''',
)
replace_once(
    ".github/workflows/ci.yml",
    "          ref: f41859e76c7d5c2a5935a93031b99c4aad65a159\n",
    "          ref: 3bc614b45055d868295545d548c2453a6ff8baa3\n",
)

# --- frontend request tests ----------------------------------------------
with Path("frontend/src/utils/__tests__/offerSnapshotRequest.test.ts").open(
    "a", encoding="utf-8"
) as handle:
    handle.write(
        '''\n\ndescribe("canonical logistics timing in the Core snapshot payload", () => {\n  it("omits canonical delivery fields when no explicit structured window exists", () => {\n    const body = buildOfferSnapshotRequest(draft, "inq-1", null);\n    expect(body.event).not.toHaveProperty("delivery_date_local");\n    expect(body.event.time_window_text).toBe("18:00");\n  });\n\n  it("sends an explicit canonical delivery window without parsing eventTime", () => {\n    const body = buildOfferSnapshotRequest(\n      {\n        ...draft,\n        orderContext: {\n          ...draft.orderContext,\n          eventTime: "abends",\n          deliveryDate: "2026-08-20",\n          deliveryWindowStart: "17:30",\n          deliveryWindowEnd: "18:15",\n        },\n      },\n      "inq-1",\n      null,\n    );\n    expect(body.event).toMatchObject({\n      time_window_text: "abends",\n      delivery_date_local: "2026-08-20",\n      delivery_window_start_local: "17:30",\n      delivery_window_end_local: "18:15",\n    });\n  });\n\n  it("rejects a partial canonical delivery window", () => {\n    expect(() =>\n      buildOfferSnapshotRequest(\n        {\n          ...draft,\n          orderContext: {\n            ...draft.orderContext,\n            deliveryDate: "2026-08-20",\n            deliveryWindowStart: "17:30",\n          },\n        },\n        "inq-1",\n        null,\n      ),\n    ).toThrow("invalid_delivery_window");\n  });\n\n  it("sends canonical SAME_DAY pickup timing only when the explicit pair exists", () => {\n    const definition = buildChargesDefinition({\n      ...draft.chargesDefinition,\n      returnLogistics: {\n        mode: "SAME_DAY",\n        pickupWindowText: "22:00–23:00",\n        sameDayFeeCents: 2500,\n        pickupWindowStartLocal: "22:00",\n        pickupWindowEndLocal: "23:00",\n      },\n    });\n    expect(definition.return_logistics).toEqual({\n      mode: "SAME_DAY",\n      pickup_window_text: "22:00–23:00",\n      same_day_fee_cents: 2500,\n      pickup_window_start_local: "22:00",\n      pickup_window_end_local: "23:00",\n    });\n  });\n\n  it("preserves the V2 return shape when SAME_DAY canonical pickup timing is unknown", () => {\n    const definition = buildChargesDefinition({\n      ...draft.chargesDefinition,\n      returnLogistics: {\n        mode: "SAME_DAY",\n        pickupWindowText: "nach Veranstaltungsende",\n        sameDayFeeCents: 2500,\n      },\n    });\n    expect(definition.return_logistics).toEqual({\n      mode: "SAME_DAY",\n      pickup_window_text: "nach Veranstaltungsende",\n      same_day_fee_cents: 2500,\n    });\n  });\n});\n'''
    )

# --- frontend persistence tests ------------------------------------------
with Path("frontend/src/utils/__tests__/draftPersistence.test.ts").open(
    "a", encoding="utf-8"
) as handle:
    handle.write(
        '''\n\ndescribe("canonical logistics timing draft compatibility", () => {\n  it("round-trips explicit delivery and SAME_DAY pickup timing", () => {\n    const storage = new FakeStorage();\n    const draft = draftWithBudget({\n      orderContext: {\n        ...createInitialOfferDraft().orderContext,\n        deliveryDate: "2026-10-01",\n        deliveryWindowStart: "18:00",\n        deliveryWindowEnd: "19:00",\n      },\n      chargesDefinition: {\n        ...createInitialOfferDraft().chargesDefinition,\n        returnLogistics: {\n          mode: "SAME_DAY",\n          pickupWindowText: "22:00–23:00",\n          sameDayFeeCents: 2500,\n          pickupWindowStartLocal: "22:00",\n          pickupWindowEndLocal: "23:00",\n        },\n      },\n    });\n    saveDraftToSession(INQUIRY_A, draft, storage);\n    const restored = readDraftFromSession(INQUIRY_A, storage);\n    expect(restored?.orderContext.deliveryWindowStart).toBe("18:00");\n    expect(restored?.chargesDefinition.returnLogistics?.pickupWindowEndLocal).toBe("23:00");\n  });\n\n  it("keeps an older draft with no canonical timing readable", () => {\n    const storage = new FakeStorage();\n    const legacy = createInitialOfferDraft();\n    saveDraftToSession(INQUIRY_A, legacy, storage);\n    const restored = readDraftFromSession(INQUIRY_A, storage);\n    expect(restored).not.toBeNull();\n    expect(restored?.orderContext.deliveryWindowStart).toBeUndefined();\n    expect(restored?.chargesDefinition.returnLogistics?.pickupWindowStartLocal).toBeUndefined();\n  });\n});\n'''
    )

# --- return logistics UI test --------------------------------------------
replace_once(
    "frontend/src/components/summary/__tests__/ChargeConfiguratorReturnLogistics.test.tsx",
    '''\t\texpect(screen.getByLabelText("Abholfenster Rückholung")).toBeTruthy();\n''',
    '''\t\texpect(screen.getByLabelText("Abholfenster Rückholung")).toBeTruthy();\n    expect(screen.getByLabelText("Abholung Rückholung von")).toBeTruthy();\n    expect(screen.getByLabelText("Abholung Rückholung bis")).toBeTruthy();\n''',
)

# --- backend model tests --------------------------------------------------
with Path("backend/tests/test_charges_definition_model.py").open(
    "a", encoding="utf-8"
) as handle:
    handle.write(
        '''\n\ndef test_same_day_accepts_optional_canonical_pickup_pair() -> None:\n    parsed = ChargesDefinitionIn.model_validate(\n        _valid_payload(\n            return_logistics={\n                "mode": "SAME_DAY",\n                "pickup_window_text": "22:00-23:00",\n                "same_day_fee_cents": 2500,\n                "pickup_window_start_local": "22:00",\n                "pickup_window_end_local": "23:00",\n            }\n        )\n    )\n    assert parsed.return_logistics.pickup_window_start_local == "22:00"\n    assert parsed.return_logistics.pickup_window_end_local == "23:00"\n\n\n@pytest.mark.parametrize(\n    "return_logistics",\n    [\n        {\n            "mode": "SAME_DAY",\n            "pickup_window_text": "22:00-23:00",\n            "same_day_fee_cents": 0,\n            "pickup_window_start_local": "22:00",\n        },\n        {\n            "mode": "SAME_DAY",\n            "pickup_window_text": "22:00-23:00",\n            "same_day_fee_cents": 0,\n            "pickup_window_start_local": "23:00",\n            "pickup_window_end_local": "22:00",\n        },\n        {\n            "mode": "SAME_DAY",\n            "pickup_window_text": "22:00-23:00",\n            "same_day_fee_cents": 0,\n            "pickup_window_start_local": "22:00:00",\n            "pickup_window_end_local": "23:00",\n        },\n        {\n            "mode": "NEXT_WORKING_DAY",\n            "pickup_window_text": None,\n            "same_day_fee_cents": 0,\n            "pickup_window_start_local": "10:00",\n            "pickup_window_end_local": "11:00",\n        },\n    ],\n)\ndef test_rejects_invalid_canonical_pickup_windows(\n    return_logistics: dict[str, object],\n) -> None:\n    with pytest.raises(ValidationError):\n        ChargesDefinitionIn.model_validate(\n            _valid_payload(return_logistics=return_logistics)\n        )\n'''
    )
