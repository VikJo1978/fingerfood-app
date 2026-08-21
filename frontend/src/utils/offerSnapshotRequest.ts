/** Map frontend OfferDraft to backend snapshot/prepare payloads. */

import { getCsrfToken } from "../services/session";

import type {
  ChargesDefinition,
  CustomerAddressInput,
  DeliveryFulfillmentDefinition,
  OfferDraft,
} from "../types";
import { createInitialDeliveryFulfillmentDefinition } from "../types";
import { offerDraftToCalculateBody } from "../services/api";
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

export function buildPrepareFulfillment(
  charges: ChargesDefinition
): OfferPrepareFulfillment {
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

export function buildChargesDefinition(
  charges: ChargesDefinition
): OfferSnapshotChargesDefinition {
  const current = normalizedFulfillment(charges);
  return {
    delivery: {
      // Keep the operator's configured amount while fulfillment is still
      // undecided. PICKUP is the explicit instruction that zeroes it. The
      // BFF refuses UNKNOWN before Core can persist an OfferVersion.
      amount_cents:
        current.fulfillmentMode === "PICKUP" ? 0 : charges.delivery.amountCents,
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
  };
  customer_text: {
    title: string;
    introduction: string;
    notes: string;
  };
  payment_terms: {
    method: "RECHNUNG";
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
  const billing = ctx.billingAddress?.trim() || location;
  const remarks = ctx.remarks?.trim() ?? "";
  const budgetDefinition = buildBudgetDefinition(draft);
  const guestCount = Math.round(draft.persons) || 0;
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
      time_window_text: ctx.eventTime.trim() || "–",
      location_text: location,
      guest_count: guestCount,
      planning_mode: "caterer_suggestion",
    },
    customer_text: {
      title: company,
      introduction: remarks || "Angebot erstellt im Configurator.",
      notes: remarks,
    },
    payment_terms: {
      method: "RECHNUNG",
      customer_visible_text: "Zahlung per Rechnung",
    },
    offer: { ...offerDraftToCalculateBody(draft), persons: guestCount },
    fulfillment: buildPrepareFulfillment(draft.chargesDefinition),
    charges_definition: buildChargesDefinition(draft.chargesDefinition),
  };
}

export interface OfferPrepareResponse {
  offer_id: string;
}

export type PrepareOfferErrorCode =
  | "prepare_offer_failed"
  | "invalid_prepare_response";

export class PrepareOfferError extends Error {
  readonly code: PrepareOfferErrorCode;
  readonly status?: number;

  constructor(code: PrepareOfferErrorCode, status?: number) {
    super(code);
    this.name = "PrepareOfferError";
    this.code = code;
    this.status = status;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseOfferPrepareResponse(
  value: unknown
): OfferPrepareResponse {
  if (!isPlainObject(value)) {
    throw new PrepareOfferError("invalid_prepare_response");
  }

  const offerId = value.offer_id;
  if (
    typeof offerId !== "string"
    || !CANONICAL_UUID_V4.test(offerId)
  ) {
    throw new PrepareOfferError("invalid_prepare_response");
  }

  return { offer_id: offerId };
}

export function prepareOfferErrorMessage(error: unknown): string {
  if (
    error instanceof PrepareOfferError
    && error.code === "invalid_prepare_response"
  ) {
    return "Core hat eine ungültige Antwort zurückgegeben.";
  }
  return "Angebot konnte nicht vorbereitet werden.";
}

export async function prepareOfferInCore(
  body: OfferSnapshotRequestBody
): Promise<OfferPrepareResponse> {
  const baseUrl = import.meta.env.VITE_API_URL ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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
    throw new PrepareOfferError("prepare_offer_failed", res.status);
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
  navigation.assign(
    `/api/ui/offer/open/${encodeURIComponent(result.offer_id)}`
  );
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
