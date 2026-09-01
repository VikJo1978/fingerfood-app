/** Map frontend OfferDraft to backend snapshot/prepare payloads. */

import { offerDraftToCalculateBody } from "../services/api";
import { getCsrfToken } from "../services/session";
import type {
  ChargesDefinition,
  CustomerAddressInput,
  DeliveryFulfillmentDefinition,
  OfferDraft,
  OrderContextV1,
  PaymentMethod,
  ReturnLogisticsDefinition,
} from "../types";
import {
  createInitialDeliveryFulfillmentDefinition,
  createInitialReturnLogisticsDefinition,
} from "../types";
import { PAYMENT_METHOD_CUSTOMER_TEXT, paymentMethodBlocker } from "./paymentMethod";
import { CANONICAL_UUID_V4, generateUuidV4 } from "./uuid";

/** OFFER_BUDGET_DEFINITION_V1 wire shape — matches the Core snapshot
 * contract exactly (uppercase enums, integer euro cents; see
 * silberloeffel-catering domain/offer_budget_definition.py). Internal
 * planning metadata only: never referenced by anything customer-facing. */
export interface OfferSnapshotBudgetDefinition {
  amount_cents: number;
  type: "TOTAL" | "PER_PERSON";
  tax_basis: "GROSS" | "NET";
  cost_scope: "FULL_OFFER" | "POSITIONS_ONLY";
}

export interface OfferSnapshotChargesDefinition {
  delivery: {
    amount_cents: number;
  };
  dishware: {
    base_mode: "NONE" | "PAUSCHALE";
    pauschale_per_person_cents: number;
    additional_lines: {
      description: string;
      quantity: number;
      unit_net_cents: number;
    }[];
  };
  buffet: {
    base_mode: "NONE" | "PAUSCHALE";
    pauschale_per_person_cents: number;
  };
  return_logistics: {
    mode: "NEXT_WORKING_DAY" | "SAME_DAY";
    pickup_window_text: string | null;
    same_day_fee_cents: number;
    pickup_window_start_local?: string;
    pickup_window_end_local?: string;
  };
}

export interface OfferPrepareAddress {
  street: string;
  postal_code: string;
  city: string;
  country: string;
}

export interface OfferPrepareFulfillment {
  fulfillment_mode: DeliveryFulfillmentDefinition["fulfillmentMode"];
  delivery_address_mode: DeliveryFulfillmentDefinition["deliveryAddressMode"];
  invoice_address: OfferPrepareAddress | null;
  delivery_address: OfferPrepareAddress | null;
}

const CANONICAL_LOCAL_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function canonicalLocalTime(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  if (!CANONICAL_LOCAL_TIME_RE.test(normalized)) {
    throw new Error("invalid_canonical_logistics_time");
  }
  return normalized;
}

function canonicalEventStartTiming(context: OrderContextV1): Record<string, string> {
  const explicit = context.eventStart?.trim() ?? "";
  const legacyExact = context.eventTime.trim();
  const value = explicit || (CANONICAL_LOCAL_TIME_RE.test(legacyExact) ? legacyExact : "");
  if (!value) return {};
  return { event_start_local: canonicalLocalTime(value) };
}

function canonicalExactDeliveryTiming(context: OrderContextV1): Record<string, string> {
  const value = context.deliveryTime?.trim() ?? "";
  if (!value) return {};
  return { delivery_time_local: canonicalLocalTime(value) };
}

function canonicalDeliveryTiming(context: OrderContextV1): Record<string, string> {
  const serviceDate = context.deliveryDate?.trim() ?? "";
  const start = context.deliveryWindowStart?.trim() ?? "";
  const end = context.deliveryWindowEnd?.trim() ?? "";
  const supplied = [serviceDate, start, end].filter(Boolean).length;
  if (supplied === 0) return {};
  if (supplied !== 3 || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    throw new Error("invalid_delivery_window");
  }
  const canonicalStart = canonicalLocalTime(start);
  const canonicalEnd = canonicalLocalTime(end);
  if (canonicalStart >= canonicalEnd) throw new Error("invalid_delivery_window");
  return {
    delivery_date_local: serviceDate,
    delivery_window_start_local: canonicalStart,
    delivery_window_end_local: canonicalEnd,
  };
}

function canonicalReturnPickupTiming(
  returnLogistics: ReturnLogisticsDefinition
): Record<string, string> {
  const start = returnLogistics.pickupWindowStartLocal?.trim() ?? "";
  const end = returnLogistics.pickupWindowEndLocal?.trim() ?? "";
  const supplied = [start, end].filter(Boolean).length;
  if (returnLogistics.mode === "NEXT_WORKING_DAY") {
    if (supplied !== 0) throw new Error("invalid_return_pickup_window");
    return {};
  }
  if (supplied === 0) return {};
  if (supplied !== 2) throw new Error("invalid_return_pickup_window");
  const canonicalStart = canonicalLocalTime(start);
  const canonicalEnd = canonicalLocalTime(end);
  if (canonicalStart >= canonicalEnd) {
    throw new Error("invalid_return_pickup_window");
  }
  return {
    pickup_window_start_local: canonicalStart,
    pickup_window_end_local: canonicalEnd,
  };
}

function normalizedFulfillment(charges: ChargesDefinition): DeliveryFulfillmentDefinition {
  return charges.delivery.fulfillment ?? createInitialDeliveryFulfillmentDefinition();
}

function addressToWire(address: CustomerAddressInput): OfferPrepareAddress | null {
  const street = address.street.trim();
  const postalCode = address.postalCode.trim();
  const city = address.city.trim();
  const country = address.country.trim();
  if (!street && !postalCode && !city && !country) return null;
  return {
    street,
    postal_code: postalCode,
    city,
    country,
  };
}

function addressIsComplete(address: CustomerAddressInput): boolean {
  const wire = addressToWire(address);
  return (
    wire !== null &&
    wire.street !== "" &&
    wire.postal_code !== "" &&
    wire.city !== "" &&
    wire.country !== ""
  );
}

function formatCustomerAddress(address: CustomerAddressInput): string {
  const street = address.street.trim();
  const postalCode = address.postalCode.trim();
  const city = address.city.trim();
  const country = address.country.trim();

  // Country defaults to DE even for an otherwise untouched address, so it
  // must not make an empty structured address override a meaningful legacy
  // billingAddress during rolling compatibility.
  if (!street && !postalCode && !city) return "";

  return [street, [postalCode, city].filter(Boolean).join(" "), country].filter(Boolean).join(", ");
}

export function buildPrepareFulfillment(charges: ChargesDefinition): OfferPrepareFulfillment {
  const current = normalizedFulfillment(charges);
  return {
    fulfillment_mode: current.fulfillmentMode,
    delivery_address_mode:
      current.fulfillmentMode === "DELIVERY" ? current.deliveryAddressMode : "UNKNOWN",
    invoice_address: addressToWire(current.invoiceAddress),
    delivery_address:
      current.fulfillmentMode === "DELIVERY" && current.deliveryAddressMode === "SEPARATE"
        ? addressToWire(current.deliveryAddress)
        : null,
  };
}

export function prepareFulfillmentBlocker(charges: ChargesDefinition): string | null {
  const current = normalizedFulfillment(charges);
  if (current.fulfillmentMode === "UNKNOWN") {
    return "Bitte zuerst Lieferung oder Selbstabholung wählen.";
  }
  if (current.fulfillmentMode === "PICKUP") {
    return null;
  }
  if (current.deliveryAddressMode === "UNKNOWN") {
    return "Bitte zuerst auswählen, welche Lieferadresse verwendet wird.";
  }
  if (
    current.deliveryAddressMode === "SAME_AS_INVOICE" &&
    !addressIsComplete(current.invoiceAddress)
  ) {
    return "Bitte die Rechnungsadresse vollständig mit Straße, PLZ, Ort und Land angeben.";
  }
  if (current.deliveryAddressMode === "SEPARATE" && !addressIsComplete(current.deliveryAddress)) {
    return "Bitte die abweichende Lieferadresse vollständig mit Straße, PLZ, Ort und Land angeben.";
  }
  return null;
}

export function buildBudgetDefinition(
  draft: OfferDraft
): OfferSnapshotBudgetDefinition | undefined {
  if (!draft.budgetEnabled) return undefined;
  return {
    amount_cents: Math.round(Math.max(0, draft.totalBudget) * 100),
    type: draft.budgetType === "per_person" ? "PER_PERSON" : "TOTAL",
    tax_basis: draft.budgetBasis === "gross" ? "GROSS" : "NET",
    cost_scope: draft.budgetScope === "full_offer" ? "FULL_OFFER" : "POSITIONS_ONLY",
  };
}

export function buildChargesDefinition(charges: ChargesDefinition): OfferSnapshotChargesDefinition {
  const current = normalizedFulfillment(charges);
  const returnLogistics = charges.returnLogistics ?? createInitialReturnLogisticsDefinition();
  const canonicalPickup = canonicalReturnPickupTiming(returnLogistics);
  return {
    delivery: {
      // Keep the operator's configured amount while fulfillment is still
      // undecided. PICKUP is the explicit instruction that zeroes it. The
      // BFF refuses UNKNOWN before Core can persist an OfferVersion.
      amount_cents: current.fulfillmentMode === "PICKUP" ? 0 : charges.delivery.amountCents,
    },
    dishware: {
      base_mode: charges.dishware.baseMode,
      pauschale_per_person_cents: charges.dishware.pauschalePerPersonCents,
      additional_lines: charges.dishware.additionalLines.map((line) => ({
        description: line.description.trim(),
        quantity: line.quantity,
        unit_net_cents: line.unitNetCents,
      })),
    },
    buffet: {
      base_mode: charges.buffet.baseMode,
      pauschale_per_person_cents: charges.buffet.pauschalePerPersonCents,
    },
    return_logistics: {
      mode: returnLogistics.mode,
      pickup_window_text:
        returnLogistics.mode === "SAME_DAY"
          ? returnLogistics.pickupWindowText?.trim() || null
          : null,
      same_day_fee_cents: returnLogistics.sameDayFeeCents,
      ...canonicalPickup,
    },
  };
}

export interface OfferSnapshotRequestBody {
  inquiry_id?: string;
  context_id?: string;
  snapshot_id: string;
  valid_until: string;
  source_draft_id?: string | null;
  recipient: {
    company_name: string;
    contact_name: string;
    email: string;
    postal_address: string;
  };
  event: {
    event_date: string;
    time_window_text: string;
    location_text: string;
    guest_count: number;
    planning_mode: "caterer_suggestion" | "self_select";
    event_start_local?: string;
    delivery_time_local?: string;
    delivery_date_local?: string;
    delivery_window_start_local?: string;
    delivery_window_end_local?: string;
  };
  customer_text: {
    title: string;
    introduction: string;
    notes: string;
  };
  payment_terms: {
    method: PaymentMethod;
    customer_visible_text: string;
  };
  offer: ReturnType<typeof offerDraftToCalculateBody>;
  fulfillment: OfferPrepareFulfillment;
  /** Present only when the operator enabled budget tracking for this
   * draft — omitted entirely (not null/undefined-valued) otherwise, so no
   * unsupported/empty field ever reaches Core. */
  budget_definition?: OfferSnapshotBudgetDefinition;
  charges_definition: OfferSnapshotChargesDefinition;
}

function defaultValidUntil(eventDate: string): string {
  const parsed = new Date(`${eventDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    const today = new Date();
    today.setDate(today.getDate() + 14);
    return today.toISOString().slice(0, 10);
  }
  parsed.setDate(parsed.getDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export function buildOfferSnapshotRequest(
  draft: OfferDraft,
  inquiryId: string | null,
  draftId: string | null,
  contextId: string | null = null
): OfferSnapshotRequestBody {
  const ctx = draft.orderContext;
  const company = ctx.companyName.trim() || "Angebot";
  const contact = ctx.contactPerson.trim() || company;
  const email = ctx.email?.trim() || "kunde@example.invalid";
  const location = ctx.location.trim() || "–";
  const structuredInvoiceAddress = formatCustomerAddress(
    draft.chargesDefinition.delivery.fulfillment?.invoiceAddress ??
      createInitialDeliveryFulfillmentDefinition().invoiceAddress
  );
  const billing = structuredInvoiceAddress || ctx.billingAddress?.trim() || location;
  const remarks = ctx.remarks?.trim() ?? "";
  const budgetDefinition = buildBudgetDefinition(draft);
  const guestCount = Math.round(draft.persons) || 0;
  const eventStartTiming = canonicalEventStartTiming(ctx);
  const deliveryTiming = ctx.deliveryTime?.trim()
    ? canonicalExactDeliveryTiming(ctx)
    : canonicalDeliveryTiming(ctx);
  const paymentBlocker = paymentMethodBlocker(ctx.companyName, draft.paymentMethod);
  if (paymentBlocker !== null || draft.paymentMethod === undefined) {
    throw new Error("invalid_payment_method");
  }
  const paymentMethod = draft.paymentMethod;
  return {
    ...(contextId ? { context_id: contextId } : { inquiry_id: inquiryId ?? "" }),
    snapshot_id: generateUuidV4(),
    valid_until: defaultValidUntil(ctx.eventDate),
    ...(draftId ? { source_draft_id: draftId } : {}),
    ...(budgetDefinition ? { budget_definition: budgetDefinition } : {}),
    recipient: {
      company_name: company,
      contact_name: contact,
      email,
      postal_address: billing,
    },
    event: {
      event_date: ctx.eventDate,
      time_window_text: ctx.eventStart?.trim() || ctx.eventTime.trim() || "–",
      location_text: location,
      guest_count: guestCount,
      planning_mode: "caterer_suggestion",
      ...eventStartTiming,
      ...deliveryTiming,
    },
    customer_text: {
      title: company,
      introduction: remarks || "Angebot erstellt im Configurator.",
      notes: remarks,
    },
    payment_terms: {
      method: paymentMethod,
      customer_visible_text: PAYMENT_METHOD_CUSTOMER_TEXT[paymentMethod],
    },
    offer: { ...offerDraftToCalculateBody(draft), persons: guestCount },
    fulfillment: buildPrepareFulfillment(draft.chargesDefinition),
    charges_definition: buildChargesDefinition(draft.chargesDefinition),
  };
}

export interface OfferPrepareResponse {
  offer_id: string;
}

export type PrepareOfferErrorCode = "prepare_offer_failed" | "invalid_prepare_response";

export class PrepareOfferError extends Error {
  readonly code: PrepareOfferErrorCode;
  readonly status?: number;
  readonly detailCode?: string;

  constructor(code: PrepareOfferErrorCode, status?: number, detailCode?: string) {
    super(code);
    this.name = "PrepareOfferError";
    this.code = code;
    this.status = status;
    this.detailCode = detailCode;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseOfferPrepareResponse(value: unknown): OfferPrepareResponse {
  if (!isPlainObject(value)) {
    throw new PrepareOfferError("invalid_prepare_response");
  }

  const offerId = value.offer_id;
  if (typeof offerId !== "string" || !CANONICAL_UUID_V4.test(offerId)) {
    throw new PrepareOfferError("invalid_prepare_response");
  }

  return { offer_id: offerId };
}

const PREPARE_ERROR_MESSAGES: Record<string, string> = {
  private_invoice_not_allowed:
    "Rechnung ist nur für Firmenkunden zulässig. Bitte Vorkasse oder Bar vor Ort wählen.",
  payment_terms_invalid: "Die Zahlungsart ist ungültig. Bitte neu auswählen.",
  fulfillment_mode_required: "Bitte zuerst Lieferung oder Selbstabholung wählen.",
  delivery_address_mode_required: "Bitte zuerst auswählen, welche Lieferadresse verwendet wird.",
  invoice_address_required: "Bitte zuerst die Rechnungsadresse angeben.",
  invoice_address_incomplete:
    "Bitte die Rechnungsadresse vollständig mit Straße, PLZ, Ort und Land angeben.",
  delivery_address_required: "Bitte zuerst die abweichende Lieferadresse angeben.",
  delivery_address_incomplete:
    "Bitte die abweichende Lieferadresse vollständig mit Straße, PLZ, Ort und Land angeben.",
  prepare_context_expired:
    "Die Angebotsvorbereitung ist abgelaufen. Bitte die Anfrage erneut öffnen.",
  prepare_context_consumed:
    "Diese Angebotsvorbereitung wurde bereits verwendet. Bitte die Anfrage erneut öffnen.",
  invalid_offer_snapshot:
    "Die Angebotsdaten sind widersprüchlich oder unvollständig. Bitte Positionen, Personenzahl und Pauschalen prüfen.",
  stale_catalog_positions:
    "Der Entwurf enthält veraltete Katalogpositionen. Bitte die Seite neu laden; bekannte Positionen werden automatisch auf den aktuellen Katalog aktualisiert.",
  core_fulfillment_persist_failed:
    "Lieferart oder Adressdaten konnten nicht in Core gespeichert werden. Bitte die Anfrage neu öffnen und erneut versuchen.",
  core_offer_prepare_failed:
    "Core konnte das Angebot nicht anlegen. Die Eingaben wurden nicht als Angebot übernommen.",
};

function prepareErrorDetailCode(value: unknown): string | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.detail)) {
    return undefined;
  }
  const code = value.detail.code;
  if (typeof code !== "string" || !(code in PREPARE_ERROR_MESSAGES)) {
    return undefined;
  }
  return code;
}

export function prepareOfferErrorMessage(error: unknown): string {
  if (error instanceof PrepareOfferError && error.code === "invalid_prepare_response") {
    return "Core hat eine ungültige Antwort zurückgegeben.";
  }
  if (error instanceof PrepareOfferError && error.detailCode) {
    return PREPARE_ERROR_MESSAGES[error.detailCode] ?? "Angebot konnte nicht vorbereitet werden.";
  }
  return "Angebot konnte nicht vorbereitet werden.";
}

export async function prepareOfferInCore(
  body: OfferSnapshotRequestBody
): Promise<OfferPrepareResponse> {
  const baseUrl = import.meta.env.VITE_API_URL ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const res = await fetch(`${baseUrl}/api/ui/offer/prepare`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detailCode: string | undefined;
    try {
      detailCode = prepareErrorDetailCode(await res.json());
    } catch {
      detailCode = undefined;
    }
    throw new PrepareOfferError("prepare_offer_failed", res.status, detailCode);
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new PrepareOfferError("invalid_prepare_response");
  }
  return parseOfferPrepareResponse(payload);
}

export interface OfferNavigation {
  assign(url: string): void;
}

export function navigateToPreparedCoreOffer(
  result: OfferPrepareResponse,
  navigation: OfferNavigation = window.location
): void {
  navigation.assign(`/api/ui/offer/open/${encodeURIComponent(result.offer_id)}`);
}

export interface PrepareAndNavigateOptions {
  navigation?: OfferNavigation;
  onPrepared?: (result: OfferPrepareResponse) => void;
}

export async function prepareAndNavigateToCoreOffer(
  body: OfferSnapshotRequestBody,
  options: PrepareAndNavigateOptions = {}
): Promise<OfferPrepareResponse> {
  const result = await prepareOfferInCore(body);
  options.onPrepared?.(result);
  navigateToPreparedCoreOffer(result, options.navigation);
  return result;
}
