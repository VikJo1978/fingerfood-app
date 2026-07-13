import type { InquiryToConfiguratorTransferV1 } from "../types";

export const CORE_INQUIRY_HANDOFF_SCHEMA = "core_inquiry_offer_prefill_v1";
export const CORE_INQUIRY_FRAGMENT_PREFIX = "#core-inquiry=";
const MAX_FRAGMENT_CHARS = 16_000;

export interface CoreInquiryOfferPrefillV1 {
  schema_version: typeof CORE_INQUIRY_HANDOFF_SCHEMA;
  source: "silberloeffel-core";
  inquiry_id: string;
  transfer: InquiryToConfiguratorTransferV1;
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
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((-encoded.length) % 4);
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
  } catch {
    return null;
  }
}

export function consumeCoreInquiryHandoff(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">
): { present: boolean; handoff: CoreInquiryOfferPrefillV1 | null } {
  if (!location.hash.startsWith(CORE_INQUIRY_FRAGMENT_PREFIX)) {
    return { present: false, handoff: null };
  }
  const handoff = parseCoreInquiryHandoff(location.hash);
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return { present: true, handoff };
}
