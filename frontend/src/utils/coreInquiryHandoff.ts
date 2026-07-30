import type { InquiryToConfiguratorTransferV1 } from "../types";

export const CORE_INQUIRY_HANDOFF_SCHEMA = "core_inquiry_offer_prefill_v1";
export const CORE_INQUIRY_FRAGMENT_PREFIX = "#core-inquiry=";
/** Namespaced and versioned: bumping the suffix makes any handoff persisted
 * by a previous app version invisible to readStoredCoreInquiryHandoff (it
 * simply won't be found under the new key), rather than being misread. */
export const CORE_INQUIRY_SESSION_KEY = "fingerfood.core-inquiry-handoff.v1";
const MAX_FRAGMENT_CHARS = 16_000;

export interface CoreInquiryOfferPrefillV1 {
  schema_version: typeof CORE_INQUIRY_HANDOFF_SCHEMA;
  source: "silberloeffel-core";
  inquiry_id: string;
  transfer: InquiryToConfiguratorTransferV1;
}

/** Minimal marker written into this specific history entry's `state` when a
 * handoff is consumed — evidence that *this* entry (not just "the tab" via
 * sessionStorage) originated from a Core handoff. A reload re-uses the same
 * history entry and its state; a genuinely fresh/direct navigation (typed
 * URL, bookmark, new tab) does not carry it over. Deliberately holds only
 * the inquiry id, not contact details — history.state is not a place for
 * customer data. */
export interface CoreInquiryHandoffHistoryMarker {
  schema_version: typeof CORE_INQUIRY_HANDOFF_SCHEMA;
  inquiry_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max = 5_000): value is string {
  return typeof value === "string" && value.length <= max;
}

function isNullablePersons(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2_000)
  );
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isTransfer(value: unknown): value is InquiryToConfiguratorTransferV1 {
  if (!isRecord(value) || !isRecord(value.planning) || !isRecord(value.orderContextPrefill)) {
    return false;
  }
  const planning = value.planning;
  const prefill = value.orderContextPrefill;
  return (
    isNullablePersons(planning.persons) &&
    (planning.budget === null ||
      (typeof planning.budget === "number" && Number.isFinite(planning.budget))) &&
    typeof planning.budgetEnabled === "boolean" &&
    Array.isArray(planning.desiredModules) &&
    planning.desiredModules.length <= 5 &&
    planning.desiredModules.every((item) =>
      ["food", "beverage", "staff", "tableware", "equipment"].includes(String(item))
    ) &&
    isText(planning.dietaryRequirements) &&
    isText(planning.eventType) &&
    isText(planning.serviceStyle) &&
    isText(prefill.companyName) &&
    isText(prefill.contactPerson) &&
    isText(prefill.email) &&
    isText(prefill.phone) &&
    isIsoDate(prefill.eventDate) &&
    isText(prefill.eventTime) &&
    isText(prefill.location) &&
    isText(prefill.billingAddress) &&
    isText(prefill.remarks)
  );
}

function decodeBase64Url(encoded: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("invalid base64url");
  const paddingLength = (4 - (encoded.length % 4)) % 4;
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(paddingLength);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function parseCoreInquiryHandoff(fragment: string): CoreInquiryOfferPrefillV1 | null {
  if (
    fragment.length > MAX_FRAGMENT_CHARS ||
    !fragment.startsWith(CORE_INQUIRY_FRAGMENT_PREFIX)
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(
      decodeBase64Url(fragment.slice(CORE_INQUIRY_FRAGMENT_PREFIX.length))
    );
    return validateHandoffPayload(parsed);
  } catch {
    return null;
  }
}

function validateHandoffPayload(parsed: unknown): CoreInquiryOfferPrefillV1 | null {
  if (!isRecord(parsed)) return null;
  if (
    parsed.schema_version !== CORE_INQUIRY_HANDOFF_SCHEMA ||
    parsed.source !== "silberloeffel-core" ||
    !isText(parsed.inquiry_id, 100) ||
    !parsed.inquiry_id ||
    !isTransfer(parsed.transfer)
  ) {
    return null;
  }
  return parsed as unknown as CoreInquiryOfferPrefillV1;
}

/**
 * Re-validates a handoff object round-tripped through sessionStorage (see
 * readStoredCoreInquiryHandoff). The URL fragment is one-shot —
 * consumeCoreInquiryHandoff strips it from the address bar as soon as it's
 * read — so a reload of the same tab after that point has nothing left in
 * the URL to parse. This applies the exact same trust/validation as a fresh
 * fragment to whatever was cached, never assuming stored data is safe.
 */
export function validateStoredCoreInquiryHandoff(
  raw: string
): CoreInquiryOfferPrefillV1 | null {
  try {
    return validateHandoffPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

function isHistoryMarker(value: unknown): value is CoreInquiryHandoffHistoryMarker {
  return (
    isRecord(value) &&
    value.schema_version === CORE_INQUIRY_HANDOFF_SCHEMA &&
    isText(value.inquiry_id, 100) &&
    !!value.inquiry_id
  );
}

/** Reads this history entry's own handoff marker, if any — see
 * CoreInquiryHandoffHistoryMarker for why this (not sessionStorage alone)
 * is the trust boundary for reload-restoration. */
export function readCoreInquiryHandoffHistoryMarker(
  history: Pick<History, "state">
): CoreInquiryHandoffHistoryMarker | null {
  return isHistoryMarker(history.state) ? history.state : null;
}

export function consumeCoreInquiryHandoff(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">
): { present: boolean; handoff: CoreInquiryOfferPrefillV1 | null } {
  if (!location.hash.startsWith(CORE_INQUIRY_FRAGMENT_PREFIX)) {
    return { present: false, handoff: null };
  }
  const handoff = parseCoreInquiryHandoff(location.hash);
  const marker: CoreInquiryHandoffHistoryMarker | null =
    handoff !== null
      ? { schema_version: CORE_INQUIRY_HANDOFF_SCHEMA, inquiry_id: handoff.inquiry_id }
      : null;
  history.replaceState(marker, "", `${location.pathname}${location.search}`);
  return { present: true, handoff };
}

/**
 * Persists the consumed handoff so a reload of the same history entry can
 * restore it (see readStoredCoreInquiryHandoff). Contains only the approved
 * Inquiry prefill fields — the same shape as the URL fragment itself: no
 * bearer token, no Core API credentials, no priced/line-item Offer data.
 * Best-effort: failures (private browsing, quota) are swallowed since the
 * handoff still applies for this page's current life either way.
 */
export function storeCoreInquiryHandoff(
  handoff: CoreInquiryOfferPrefillV1,
  storage: Pick<Storage, "setItem"> = window.sessionStorage
): void {
  try {
    storage.setItem(CORE_INQUIRY_SESSION_KEY, JSON.stringify(handoff));
  } catch {
    // sessionStorage unavailable — not reload-safe, but non-fatal.
  }
}

/**
 * Reads and re-validates a previously-stored handoff, requiring it to match
 * `expectedInquiryId` — the *current history entry's own* marker (see
 * readCoreInquiryHandoffHistoryMarker). Never trust sessionStorage by its
 * mere presence: it persists across unrelated direct navigations in the
 * same tab, and would otherwise leak a previous customer's Inquiry into a
 * fresh, non-handoff Configurator visit. Anything missing, malformed, or
 * mismatched is removed so it cannot resurface on a later reload either.
 */
export function readStoredCoreInquiryHandoff(
  expectedInquiryId: string,
  storage: Pick<Storage, "getItem" | "removeItem"> = window.sessionStorage
): CoreInquiryOfferPrefillV1 | null {
  try {
    const raw = storage.getItem(CORE_INQUIRY_SESSION_KEY);
    if (!raw) return null;
    const restored = validateStoredCoreInquiryHandoff(raw);
    if (restored !== null && restored.inquiry_id === expectedInquiryId) {
      return restored;
    }
    storage.removeItem(CORE_INQUIRY_SESSION_KEY);
    return null;
  } catch {
    return null;
  }
}

/** Clears the stored handoff. Call at lifecycle boundaries where it must
 * not resurface: after a successful Offer preparation (before navigating to
 * Core) and when explicitly starting a new standalone draft (the
 * InquiryIntake manual-entry path). */
export function clearStoredCoreInquiryHandoff(
  storage: Pick<Storage, "removeItem"> = window.sessionStorage
): void {
  try {
    storage.removeItem(CORE_INQUIRY_SESSION_KEY);
  } catch {
    // sessionStorage unavailable — nothing to clear.
  }
}
