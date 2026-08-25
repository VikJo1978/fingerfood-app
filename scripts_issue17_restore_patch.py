from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise RuntimeError(f"anchor not found in {path}: {old[:140]!r}")
    target.write_text(text.replace(old, new, 1))


api = "frontend/src/services/api.ts"
persistence = "frontend/src/utils/draftPersistence.ts"
home = "frontend/src/pages/HomePage.tsx"

# HTTP draft payload is opaque JSON until the frontend validates it.
replace_once(
    api,
    '''  payload: OfferDraft;\n}\n\nexport async function listDrafts(): Promise<SavedOfferDraft[]> {\n''',
    '''  payload: unknown;\n}\n\nexport async function listDrafts(): Promise<SavedOfferDraft[]> {\n''',
)

# Shared restore boundary + session persistence of backend draft identity.
replace_once(
    persistence,
    '''import {\n\tcreateInitialChargesDefinition,\n\tcreateInitialReturnLogisticsDefinition,\n} from "../types";\n''',
    '''import {\n\tcreateInitialChargesDefinition,\n\tcreateInitialDeliveryFulfillmentDefinition,\n\tcreateInitialReturnLogisticsDefinition,\n} from "../types";\n''',
)

replace_once(
    persistence,
    '''interface StoredDraftEnvelope {\n  schema_version: typeof DRAFT_STORAGE_PREFIX;\n  scope_key: string;\n  saved_at: string;\n  draft: OfferDraft;\n}\n''',
    '''interface StoredDraftEnvelope {\n  schema_version: typeof DRAFT_STORAGE_PREFIX;\n  scope_key: string;\n  saved_at: string;\n  draft: OfferDraft;\n  backend_draft_id?: string | null;\n}\n\nexport interface DraftSessionState {\n  draft: OfferDraft;\n  backendDraftId: string | null;\n}\n''',
)

replace_once(
    persistence,
    '''function isDishwareAdditionalLine(\n\tvalue: unknown,\n): value is DishwareAdditionalLine {\n''',
    '''function isCustomerAddress(value: unknown): boolean {\n  if (!isRecord(value)) return false;\n  return (\n    typeof value.street === "string" &&\n    typeof value.postalCode === "string" &&\n    typeof value.city === "string" &&\n    typeof value.country === "string"\n  );\n}\n\nfunction isDeliveryFulfillmentDefinition(value: unknown): boolean {\n  if (!isRecord(value)) return false;\n  return (\n    (value.fulfillmentMode === "UNKNOWN" ||\n      value.fulfillmentMode === "PICKUP" ||\n      value.fulfillmentMode === "DELIVERY") &&\n    (value.deliveryAddressMode === "UNKNOWN" ||\n      value.deliveryAddressMode === "SAME_AS_INVOICE" ||\n      value.deliveryAddressMode === "SEPARATE") &&\n    isCustomerAddress(value.invoiceAddress) &&\n    isCustomerAddress(value.deliveryAddress)\n  );\n}\n\nfunction isDishwareAdditionalLine(\n\tvalue: unknown,\n): value is DishwareAdditionalLine {\n''',
)

replace_once(
    persistence,
    '''  if (!isNonnegativeInteger(value.delivery.amountCents)) return false;\n''',
    '''  if (!isNonnegativeInteger(value.delivery.amountCents)) return false;\n  if (\n    value.delivery.fulfillment !== undefined &&\n    !isDeliveryFulfillmentDefinition(value.delivery.fulfillment)\n  ) {\n    return false;\n  }\n''',
)

replace_once(
    persistence,
    '''function isOfferLine(value: unknown): value is OfferLine {\n  if (!isRecord(value)) return false;\n\tif (!isNonEmptyString(value.lineId) || !isNonEmptyString(value.itemId))\n\t\treturn false;\n\tif (value.quantityMode !== "total" && value.quantityMode !== "per_person")\n\t\treturn false;\n  if (!isFiniteNumber(value.quantity)) return false;\n  if (!isRecord(value.snapshot)) return false;\n  const snapshot = value.snapshot;\n  if (\n    typeof snapshot.title !== "string" ||\n\t\t(snapshot.source_type !== "internal" &&\n\t\t\tsnapshot.source_type !== "external") ||\n\t\t(snapshot.pricing_mode !== "per_piece" &&\n\t\t\tsnapshot.pricing_mode !== "per_person") ||\n    (snapshot.price_type !== "piece" && snapshot.price_type !== "person") ||\n    !isFiniteNumber(snapshot.chosen_price)\n  ) {\n    return false;\n  }\n  return true;\n}\n''',
    '''function isOfferLine(value: unknown): value is OfferLine {\n  if (!isRecord(value)) return false;\n\tif (!isNonEmptyString(value.lineId) || !isNonEmptyString(value.itemId))\n\t\treturn false;\n\tif (value.quantityMode !== "total" && value.quantityMode !== "per_person")\n\t\treturn false;\n  if (!isFiniteNumber(value.quantity) || value.quantity <= 0) return false;\n  if (value.customizationNote !== undefined && typeof value.customizationNote !== "string") {\n    return false;\n  }\n  if (!isRecord(value.snapshot)) return false;\n  const snapshot = value.snapshot;\n  if (\n    typeof snapshot.title !== "string" ||\n\t\t(snapshot.source_type !== "internal" &&\n\t\t\tsnapshot.source_type !== "external") ||\n\t\t(snapshot.pricing_mode !== "per_piece" &&\n\t\t\tsnapshot.pricing_mode !== "per_person") ||\n    (snapshot.price_type !== "piece" && snapshot.price_type !== "person") ||\n    !isFiniteNumber(snapshot.chosen_price) ||\n    (snapshot.item_kind !== undefined &&\n      snapshot.item_kind !== "simple" &&\n      snapshot.item_kind !== "composite") ||\n    (snapshot.surchargeSelected !== undefined &&\n      typeof snapshot.surchargeSelected !== "boolean") ||\n    (snapshot.surchargeLabel !== undefined &&\n      snapshot.surchargeLabel !== null &&\n      typeof snapshot.surchargeLabel !== "string") ||\n    (snapshot.surchargeAmount !== undefined &&\n      snapshot.surchargeAmount !== null &&\n      !isFiniteNumber(snapshot.surchargeAmount))\n  ) {\n    return false;\n  }\n  return true;\n}\n''',
)

replace_once(
    persistence,
    '''function isStoredEnvelope(\n  value: unknown,\n\texpectedScopeKey: string,\n): value is StoredDraftEnvelope {\n  if (!isRecord(value)) return false;\n  if (value.schema_version !== DRAFT_STORAGE_PREFIX) return false;\n  if (value.scope_key !== expectedScopeKey) return false;\n  if (typeof value.saved_at !== "string") return false;\n  return isOfferDraftShape(value.draft);\n}\n''',
    '''function isStoredEnvelope(\n  value: unknown,\n\texpectedScopeKey: string,\n): value is StoredDraftEnvelope {\n  if (!isRecord(value)) return false;\n  if (value.schema_version !== DRAFT_STORAGE_PREFIX) return false;\n  if (value.scope_key !== expectedScopeKey) return false;\n  if (typeof value.saved_at !== "string") return false;\n  if (\n    value.backend_draft_id !== undefined &&\n    value.backend_draft_id !== null &&\n    !isNonEmptyString(value.backend_draft_id, 500)\n  ) {\n    return false;\n  }\n  return isOfferDraftShape(value.draft);\n}\n\n/**\n * Trust boundary for any draft payload arriving from outside current React\n * state (sessionStorage or backend Draft Storage V1). The backend stores\n * opaque JSON, so callers must never cast its payload directly to OfferDraft.\n * Older compatible drafts receive the explicit defaults introduced after\n * they were saved; malformed current fields are rejected rather than guessed.\n */\nexport function normalizeRestoredOfferDraft(value: unknown): OfferDraft | null {\n  if (!isOfferDraftShape(value)) return null;\n  const draft = value;\n  const chargesDefinition =\n    draft.chargesDefinition ?? createInitialChargesDefinition();\n  return {\n    ...draft,\n    ...normalizeBudgetDefinition(draft),\n    chargesDefinition: {\n      ...chargesDefinition,\n      delivery: {\n        ...chargesDefinition.delivery,\n        fulfillment:\n          chargesDefinition.delivery.fulfillment ??\n          createInitialDeliveryFulfillmentDefinition(),\n      },\n      returnLogistics:\n        chargesDefinition.returnLogistics ??\n        createInitialReturnLogisticsDefinition(),\n    },\n  };\n}\n''',
)

# Replace save/read implementation while preserving old convenience API for tests/callers.
replace_once(
    persistence,
    '''export function saveDraftToSession(\n  scope: DraftPersistenceScope,\n  draft: OfferDraft,\n\tstorage: Pick<Storage, "setItem"> = window.sessionStorage,\n): void {\n  const scopeKey = draftStorageKey(scope);\n  const envelope: StoredDraftEnvelope = {\n    schema_version: DRAFT_STORAGE_PREFIX,\n    scope_key: scopeKey,\n    saved_at: new Date().toISOString(),\n    draft,\n  };\n  try {\n    const serialized = JSON.stringify(envelope);\n    if (serialized.length > MAX_STORED_CHARS) return;\n    storage.setItem(scopeKey, serialized);\n  } catch {\n    // sessionStorage unavailable or serialization failed — not persisted,\n    // non-fatal.\n  }\n}\n''',
    '''export function saveDraftStateToSession(\n  scope: DraftPersistenceScope,\n  draft: OfferDraft,\n  backendDraftId: string | null,\n\tstorage: Pick<Storage, "setItem"> = window.sessionStorage,\n): void {\n  const scopeKey = draftStorageKey(scope);\n  const envelope: StoredDraftEnvelope = {\n    schema_version: DRAFT_STORAGE_PREFIX,\n    scope_key: scopeKey,\n    saved_at: new Date().toISOString(),\n    draft,\n    backend_draft_id: backendDraftId,\n  };\n  try {\n    const serialized = JSON.stringify(envelope);\n    if (serialized.length > MAX_STORED_CHARS) return;\n    storage.setItem(scopeKey, serialized);\n  } catch {\n    // sessionStorage unavailable or serialization failed — not persisted,\n    // non-fatal.\n  }\n}\n\nexport function saveDraftToSession(\n  scope: DraftPersistenceScope,\n  draft: OfferDraft,\n\tstorage: Pick<Storage, "setItem"> = window.sessionStorage,\n): void {\n  saveDraftStateToSession(scope, draft, null, storage);\n}\n''',
)

start = '''export function readDraftFromSession(\n  scope: DraftPersistenceScope,\n\tstorage: Pick<Storage, "getItem"> = window.sessionStorage,\n): OfferDraft | null {\n'''
end = '''}\n\nexport function clearDraftFromSession(\n'''
text = Path(persistence).read_text()
start_idx = text.index(start)
end_idx = text.index(end, start_idx)
old_block = text[start_idx:end_idx + 2]
new_block = '''export function readDraftStateFromSession(\n  scope: DraftPersistenceScope,\n\tstorage: Pick<Storage, "getItem"> = window.sessionStorage,\n): DraftSessionState | null {\n  const scopeKey = draftStorageKey(scope);\n  let raw: string | null;\n  try {\n    raw = storage.getItem(scopeKey);\n  } catch {\n    return null;\n  }\n  if (raw === null || raw.length > MAX_STORED_CHARS) return null;\n  let parsed: unknown;\n  try {\n    parsed = JSON.parse(raw);\n  } catch {\n    return null;\n  }\n  if (!isStoredEnvelope(parsed, scopeKey)) return null;\n  const draft = normalizeRestoredOfferDraft(parsed.draft);\n  if (draft === null) return null;\n  return {\n    draft,\n    backendDraftId: parsed.backend_draft_id ?? null,\n  };\n}\n\nexport function readDraftFromSession(\n  scope: DraftPersistenceScope,\n\tstorage: Pick<Storage, "getItem"> = window.sessionStorage,\n): OfferDraft | null {\n  return readDraftStateFromSession(scope, storage)?.draft ?? null;\n}\n'''
Path(persistence).write_text(text[:start_idx] + new_block + text[end_idx + 2:])

# HomePage: browser entry point, safe backend restore, and backend ID survives same-tab reload.
replace_once(
    home,
    '''import { InquiryIntake } from "../components/inquiry/InquiryIntake";\n''',
    '''import { InquiryIntake } from "../components/inquiry/InquiryIntake";\nimport { SavedDraftBrowser } from "../components/drafts/SavedDraftBrowser";\n''',
)
replace_once(
    home,
    '''import { createDraft, fetchItems, updateDraft } from "../services/api";\n''',
    '''import { createDraft, fetchItems, getDraft, updateDraft } from "../services/api";\n''',
)
replace_once(
    home,
    '''  clearDraftFromSession,\n  readDraftFromSession,\n  readManualDraftHistoryMarker,\n  saveDraftToSession,\n  writeManualDraftHistoryMarker,\n''',
    '''  clearDraftFromSession,\n  normalizeRestoredOfferDraft,\n  readDraftStateFromSession,\n  readManualDraftHistoryMarker,\n  saveDraftStateToSession,\n  writeManualDraftHistoryMarker,\n''',
)

replace_once(
    home,
    '''      setOfferDraft(createInitialOfferDraft());\n      setImportedInquiryId(null);\n''',
    '''      setOfferDraft(createInitialOfferDraft());\n      setCurrentDraftId(null);\n      setImportedInquiryId(null);\n''',
)

replace_once(
    home,
    '''    function restoreScopedDraft(scope: DraftPersistenceScope): void {\n      const restored = readDraftFromSession(scope);\n      if (restored !== null) {\n        setOfferDraft(restored);\n      }\n      setDraftScope(scope);\n    }\n''',
    '''    function restoreScopedDraft(scope: DraftPersistenceScope): void {\n      const restored = readDraftStateFromSession(scope);\n      if (restored !== null) {\n        setOfferDraft(restored.draft);\n        setCurrentDraftId(restored.backendDraftId);\n      } else {\n        setCurrentDraftId(null);\n      }\n      setDraftScope(scope);\n    }\n''',
)

replace_once(
    home,
    '''        const restoredManual = readDraftFromSession({ kind: "manual" });\n        if (restoredManual !== null) {\n          setOfferDraft(restoredManual);\n          setDraftScope({ kind: "manual" });\n          setPageMode("configurator");\n        }\n''',
    '''        const restoredManual = readDraftStateFromSession({ kind: "manual" });\n        if (restoredManual !== null) {\n          setOfferDraft(restoredManual.draft);\n          setCurrentDraftId(restoredManual.backendDraftId);\n          setDraftScope({ kind: "manual" });\n          setPageMode("configurator");\n        }\n''',
)
# Same manual-marker branch appears a second time in authenticated mode.
replace_once(
    home,
    '''        const restoredManual = readDraftFromSession({ kind: "manual" });\n        if (restoredManual !== null) {\n          setOfferDraft(restoredManual);\n          setDraftScope({ kind: "manual" });\n          setPageMode("configurator");\n        }\n''',
    '''        const restoredManual = readDraftStateFromSession({ kind: "manual" });\n        if (restoredManual !== null) {\n          setOfferDraft(restoredManual.draft);\n          setCurrentDraftId(restoredManual.backendDraftId);\n          setDraftScope({ kind: "manual" });\n          setPageMode("configurator");\n        }\n''',
)

replace_once(
    home,
    '''  useEffect(() => {\n    if (pageMode !== "configurator") return;\n    saveDraftToSession(draftScope, offerDraft);\n  }, [pageMode, draftScope, offerDraft]);\n''',
    '''  useEffect(() => {\n    if (pageMode !== "configurator") return;\n    saveDraftStateToSession(draftScope, offerDraft, currentDraftId);\n  }, [pageMode, draftScope, offerDraft, currentDraftId]);\n''',
)

replace_once(
    home,
    '''  const onSaveDraft = useCallback(async () => {\n''',
    '''  const onRestoreSavedDraft = useCallback(async (id: string) => {\n    const saved = await getDraft(id);\n    const restored = normalizeRestoredOfferDraft(saved.payload);\n    if (restored === null) {\n      throw new Error(\n        "Gespeicherter Entwurf ist beschädigt oder mit dieser Version nicht kompatibel."\n      );\n    }\n\n    clearStoredCoreInquiryHandoff();\n    setImportedInquiryId(null);\n    setPrepareContextId(null);\n    setHandoffError(null);\n    setPrepareStatus("idle");\n    setPrepareMessage(null);\n    setInquiryEventType("");\n    setInquiryServiceStyle("");\n    setDraftScope({ kind: "manual" });\n    writeManualDraftHistoryMarker(window.location, window.history);\n    setCurrentDraftId(saved.id);\n    setOfferDraft(restored);\n    setDraftSaveStatus("saved");\n    setDraftSaveMessage("Gespeicherter Entwurf geöffnet.");\n    setPageMode("configurator");\n  }, []);\n\n  const onSaveDraft = useCallback(async () => {\n''',
)

replace_once(
    home,
    '''          {handoffError ? <WarningBanner message={handoffError} /> : null}\n          <InquiryIntake onPrepareOffer={onManualPrepareOffer} />\n''',
    '''          {handoffError ? <WarningBanner message={handoffError} /> : null}\n          <SavedDraftBrowser onOpenDraft={onRestoreSavedDraft} />\n          <InquiryIntake onPrepareOffer={onManualPrepareOffer} />\n''',
)
