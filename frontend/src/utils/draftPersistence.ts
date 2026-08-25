import type {
  ChargesDefinition,
  DishwareAdditionalLine,
  OfferDraft,
  OfferLine,
  OrderContextV1,
} from "../types";
import {
  createInitialChargesDefinition,
  createInitialDeliveryFulfillmentDefinition,
  createInitialReturnLogisticsDefinition,
} from "../types";
import { normalizeBudgetDefinition } from "./budgetNormalization";

/** Namespaced and versioned like CORE_INQUIRY_SESSION_KEY: bumping the
 * suffix makes any draft persisted by a previous app version invisible
 * (never misread) after a schema change. */
const DRAFT_STORAGE_PREFIX = "fingerfood.configurator-draft.v1";
const MAX_STORED_CHARS = 2_000_000;

export type DraftPersistenceScope =
  | { kind: "inquiry"; inquiryId: string }
  | { kind: "handoff"; contextId: string }
  | { kind: "manual" };

/** One sessionStorage key per Inquiry identity (isolates different
 * Inquiries from each other) plus a single separate key for the
 * manual/no-Inquiry flow — never shared with any Inquiry-scoped draft. */
export function draftStorageKey(scope: DraftPersistenceScope): string {
  if (scope.kind === "inquiry") {
    return `${DRAFT_STORAGE_PREFIX}:inquiry:${scope.inquiryId}`;
  }
  if (scope.kind === "handoff") {
    return `${DRAFT_STORAGE_PREFIX}:handoff:${scope.contextId}`;
  }
  return `${DRAFT_STORAGE_PREFIX}:manual`;
}

interface StoredDraftEnvelope {
  schema_version: typeof DRAFT_STORAGE_PREFIX;
  scope_key: string;
  saved_at: string;
  draft: OfferDraft;
  backend_draft_id?: string | null;
}

export interface DraftSessionState {
  draft: OfferDraft;
  backendDraftId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1;
}

function isNonEmptyString(value: unknown, max = 2_000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isOptionalString(value: unknown, max = 2_000): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= max);
}

const CANONICAL_LOCAL_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isCanonicalOptionalWindow(start: unknown, end: unknown): boolean {
  if (start === undefined && end === undefined) return true;
  if (typeof start !== "string" || typeof end !== "string") return false;
  return CANONICAL_LOCAL_TIME_RE.test(start) && CANONICAL_LOCAL_TIME_RE.test(end) && start < end;
}

function isOrderContext(value: unknown): value is OrderContextV1 {
  if (!isRecord(value)) return false;
  return (
    typeof value.companyName === "string" &&
    typeof value.contactPerson === "string" &&
    typeof value.eventDate === "string" &&
    typeof value.eventTime === "string" &&
    typeof value.location === "string" &&
    isOptionalString(value.deliveryDate, 10) &&
    isOptionalString(value.deliveryWindowStart, 5) &&
    isOptionalString(value.deliveryWindowEnd, 5) &&
    isCanonicalOptionalWindow(value.deliveryWindowStart, value.deliveryWindowEnd) &&
    ((value.deliveryDate === undefined && value.deliveryWindowStart === undefined) ||
      (typeof value.deliveryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.deliveryDate))) &&
    isOptionalString(value.email) &&
    isOptionalString(value.phone) &&
    isOptionalString(value.billingAddress) &&
    isOptionalString(value.remarks, 20_000)
  );
}

function isOfferLine(value: unknown): value is OfferLine {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.lineId) || !isNonEmptyString(value.itemId)) return false;
  if (value.quantityMode !== "total" && value.quantityMode !== "per_person") return false;
  if (!isFiniteNumber(value.quantity) || value.quantity <= 0) return false;
  if (value.customizationNote !== undefined && typeof value.customizationNote !== "string") {
    return false;
  }
  if (!isRecord(value.snapshot)) return false;
  const snapshot = value.snapshot;
  if (
    typeof snapshot.title !== "string" ||
    (snapshot.source_type !== "internal" && snapshot.source_type !== "external") ||
    (snapshot.pricing_mode !== "per_piece" && snapshot.pricing_mode !== "per_person") ||
    (snapshot.price_type !== "piece" && snapshot.price_type !== "person") ||
    !isFiniteNumber(snapshot.chosen_price) ||
    (snapshot.item_kind !== undefined &&
      snapshot.item_kind !== "simple" &&
      snapshot.item_kind !== "composite") ||
    (snapshot.surchargeSelected !== undefined && typeof snapshot.surchargeSelected !== "boolean") ||
    (snapshot.surchargeLabel !== undefined &&
      snapshot.surchargeLabel !== null &&
      typeof snapshot.surchargeLabel !== "string") ||
    (snapshot.surchargeAmount !== undefined &&
      snapshot.surchargeAmount !== null &&
      !isFiniteNumber(snapshot.surchargeAmount))
  ) {
    return false;
  }
  return true;
}

function isCustomerAddress(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.street === "string" &&
    typeof value.postalCode === "string" &&
    typeof value.city === "string" &&
    typeof value.country === "string"
  );
}

function isDeliveryFulfillmentDefinition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.fulfillmentMode === "UNKNOWN" ||
      value.fulfillmentMode === "PICKUP" ||
      value.fulfillmentMode === "DELIVERY") &&
    (value.deliveryAddressMode === "UNKNOWN" ||
      value.deliveryAddressMode === "SAME_AS_INVOICE" ||
      value.deliveryAddressMode === "SEPARATE") &&
    isCustomerAddress(value.invoiceAddress) &&
    isCustomerAddress(value.deliveryAddress)
  );
}

function isDishwareAdditionalLine(value: unknown): value is DishwareAdditionalLine {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.lineId) &&
    isNonEmptyString(value.description, 500) &&
    value.description === value.description.trim() &&
    isPositiveInteger(value.quantity) &&
    isNonnegativeInteger(value.unitNetCents)
  );
}

function isReturnLogisticsDefinition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.mode !== "NEXT_WORKING_DAY" && value.mode !== "SAME_DAY") return false;
  if (!isNonnegativeInteger(value.sameDayFeeCents)) return false;
  if (!isCanonicalOptionalWindow(value.pickupWindowStartLocal, value.pickupWindowEndLocal)) {
    return false;
  }
  if (value.mode === "SAME_DAY") {
    return (
      isNonEmptyString(value.pickupWindowText, 500) &&
      value.pickupWindowText === value.pickupWindowText.trim()
    );
  }
  return (
    value.pickupWindowText === null &&
    value.pickupWindowStartLocal === undefined &&
    value.pickupWindowEndLocal === undefined
  );
}

function isChargesDefinition(value: unknown): value is ChargesDefinition {
  if (!isRecord(value)) return false;
  if (!isRecord(value.buffet) || !isRecord(value.delivery) || !isRecord(value.dishware)) {
    return false;
  }
  if (value.buffet.baseMode !== "NONE" && value.buffet.baseMode !== "PAUSCHALE") return false;
  if (!isNonnegativeInteger(value.buffet.pauschalePerPersonCents)) return false;
  if (!isNonnegativeInteger(value.delivery.amountCents)) return false;
  if (
    value.delivery.fulfillment !== undefined &&
    !isDeliveryFulfillmentDefinition(value.delivery.fulfillment)
  ) {
    return false;
  }
  if (value.dishware.baseMode !== "NONE" && value.dishware.baseMode !== "PAUSCHALE") {
    return false;
  }
  if (!isNonnegativeInteger(value.dishware.pauschalePerPersonCents)) return false;
  if (!Array.isArray(value.dishware.additionalLines)) return false;
  if (value.returnLogistics !== undefined && !isReturnLogisticsDefinition(value.returnLogistics)) {
    return false;
  }
  return value.dishware.additionalLines.every(isDishwareAdditionalLine);
}

function isOfferDraftShape(value: unknown): value is OfferDraft {
  if (!isRecord(value)) return false;
  if (!isOrderContext(value.orderContext)) return false;
  // Reload restoration intentionally accepts a temporary zero-guest draft
  // state; prepare-time validation still blocks sending it to Core.
  if (!isFiniteNumber(value.persons) || value.persons < 0 || value.persons > 5000) {
    return false;
  }
  if (typeof value.budgetEnabled !== "boolean") return false;
  if (!isFiniteNumber(value.totalBudget) || value.totalBudget < 0) return false;
  if (value.chargesDefinition !== undefined && !isChargesDefinition(value.chargesDefinition)) {
    return false;
  }
  if (!Array.isArray(value.lines) || !value.lines.every(isOfferLine)) return false;
  return true;
}

function isStoredEnvelope(value: unknown, expectedScopeKey: string): value is StoredDraftEnvelope {
  if (!isRecord(value)) return false;
  if (value.schema_version !== DRAFT_STORAGE_PREFIX) return false;
  if (value.scope_key !== expectedScopeKey) return false;
  if (typeof value.saved_at !== "string") return false;
  if (
    value.backend_draft_id !== undefined &&
    value.backend_draft_id !== null &&
    !isNonEmptyString(value.backend_draft_id, 500)
  ) {
    return false;
  }
  return isOfferDraftShape(value.draft);
}

/**
 * Trust boundary for any draft payload arriving from outside current React
 * state (sessionStorage or backend Draft Storage V1). The backend stores
 * opaque JSON, so callers must never cast its payload directly to OfferDraft.
 * Older compatible drafts receive the explicit defaults introduced after
 * they were saved; malformed current fields are rejected rather than guessed.
 */
export function normalizeRestoredOfferDraft(value: unknown): OfferDraft | null {
  if (!isOfferDraftShape(value)) return null;
  const draft = value;
  const chargesDefinition = draft.chargesDefinition ?? createInitialChargesDefinition();
  return {
    ...draft,
    ...normalizeBudgetDefinition(draft),
    chargesDefinition: {
      ...chargesDefinition,
      delivery: {
        ...chargesDefinition.delivery,
        fulfillment:
          chargesDefinition.delivery.fulfillment ?? createInitialDeliveryFulfillmentDefinition(),
      },
      returnLogistics:
        chargesDefinition.returnLogistics ?? createInitialReturnLogisticsDefinition(),
    },
  };
}

/** Best-effort: failures (private browsing, quota, serialization) are
 * swallowed since persistence is a convenience, not the source of truth —
 * the in-memory draft still applies for this page's current life either
 * way. */
export function saveDraftStateToSession(
  scope: DraftPersistenceScope,
  draft: OfferDraft,
  backendDraftId: string | null,
  storage: Pick<Storage, "setItem"> = window.sessionStorage
): void {
  const scopeKey = draftStorageKey(scope);
  const envelope: StoredDraftEnvelope = {
    schema_version: DRAFT_STORAGE_PREFIX,
    scope_key: scopeKey,
    saved_at: new Date().toISOString(),
    draft,
    backend_draft_id: backendDraftId,
  };
  try {
    const serialized = JSON.stringify(envelope);
    if (serialized.length > MAX_STORED_CHARS) return;
    storage.setItem(scopeKey, serialized);
  } catch {
    // sessionStorage unavailable or serialization failed — not persisted,
    // non-fatal.
  }
}

export function saveDraftToSession(
  scope: DraftPersistenceScope,
  draft: OfferDraft,
  storage: Pick<Storage, "setItem"> = window.sessionStorage
): void {
  saveDraftStateToSession(scope, draft, null, storage);
}

/**
 * Reads and strictly validates a persisted draft for exactly the given
 * scope. Never reads any other scope's key, so a different Inquiry's (or
 * the manual flow's) data can never bleed in. Malformed, foreign-scope, or
 * schema-incompatible stored JSON is rejected safely (returns null) rather
 * than partially applied — the caller falls back to a fresh draft.
 *
 * The restored draft's budgetType/budgetBasis/budgetScope are passed
 * through normalizeBudgetDefinition so a draft saved before the budget
 * selectors existed (or with any otherwise-invalid basis fields) restores
 * with the historically-correct legacy meaning, never `undefined` and
 * never left to an HTML <select>'s own fallback behavior.
 */
export function readDraftStateFromSession(
  scope: DraftPersistenceScope,
  storage: Pick<Storage, "getItem"> = window.sessionStorage
): DraftSessionState | null {
  const scopeKey = draftStorageKey(scope);
  let raw: string | null;
  try {
    raw = storage.getItem(scopeKey);
  } catch {
    return null;
  }
  if (raw === null || raw.length > MAX_STORED_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isStoredEnvelope(parsed, scopeKey)) return null;
  const draft = normalizeRestoredOfferDraft(parsed.draft);
  if (draft === null) return null;
  return {
    draft,
    backendDraftId: parsed.backend_draft_id ?? null,
  };
}

export function readDraftFromSession(
  scope: DraftPersistenceScope,
  storage: Pick<Storage, "getItem"> = window.sessionStorage
): OfferDraft | null {
  return readDraftStateFromSession(scope, storage)?.draft ?? null;
}

export function clearDraftFromSession(
  scope: DraftPersistenceScope,
  storage: Pick<Storage, "removeItem"> = window.sessionStorage
): void {
  try {
    storage.removeItem(draftStorageKey(scope));
  } catch {
    // sessionStorage unavailable — nothing to clear.
  }
}

const MANUAL_DRAFT_MARKER_SCHEMA = "fingerfood.configurator-draft.v1.manual-marker";

interface ManualDraftHistoryMarker {
  schema_version: typeof MANUAL_DRAFT_MARKER_SCHEMA;
}

/** Mirrors the Core-inquiry history marker (see coreInquiryHandoff.ts) for
 * the manual/no-Inquiry flow: written into this history entry's own
 * `state` when the operator explicitly starts a manual draft, so a
 * same-tab reload can tell "this entry was a manual Configurator session"
 * and restore its scoped draft — without a bare sessionStorage flag that
 * could resurface in an unrelated later tab/visit. */
export function writeManualDraftHistoryMarker(
  location: Pick<Location, "pathname" | "search">,
  history: Pick<History, "replaceState">
): void {
  history.replaceState(
    {
      schema_version: MANUAL_DRAFT_MARKER_SCHEMA,
    } satisfies ManualDraftHistoryMarker,
    "",
    `${location.pathname}${location.search}`
  );
}

export function readManualDraftHistoryMarker(
  history: Pick<History, "state">
): ManualDraftHistoryMarker | null {
  const state: unknown = history.state;
  if (isRecord(state) && state.schema_version === MANUAL_DRAFT_MARKER_SCHEMA) {
    return state as unknown as ManualDraftHistoryMarker;
  }
  return null;
}
