/** Map frontend OfferDraft to backend snapshot/prepare payloads. */

import type { OfferDraft } from "../types";
import { offerDraftToCalculateBody } from "../services/api";

export interface OfferSnapshotRequestBody {
  inquiry_id: string;
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
  inquiryId: string,
  draftId: string | null
): OfferSnapshotRequestBody {
  const ctx = draft.orderContext;
  const company = ctx.companyName.trim() || "Angebot";
  const contact = ctx.contactPerson.trim() || company;
  const email = ctx.email?.trim() || "kunde@example.invalid";
  const location = ctx.location.trim() || "–";
  const billing = ctx.billingAddress?.trim() || location;
  const remarks = ctx.remarks?.trim() ?? "";
  return {
    inquiry_id: inquiryId,
    snapshot_id: crypto.randomUUID(),
    valid_until: defaultValidUntil(ctx.eventDate),
    ...(draftId ? { source_draft_id: draftId } : {}),
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
      guest_count: Math.max(1, Math.round(draft.persons) || 1),
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
    offer: offerDraftToCalculateBody(draft),
  };
}

export interface OfferPrepareResponse {
  offer_id: string;
  redirect_url: string;
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

const CANONICAL_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
  const redirectValue = value.redirect_url;
  if (
    typeof offerId !== "string"
    || !CANONICAL_UUID_V4.test(offerId)
    || typeof redirectValue !== "string"
  ) {
    throw new PrepareOfferError("invalid_prepare_response");
  }

  let redirect: URL;
  try {
    redirect = new URL(redirectValue);
  } catch {
    throw new PrepareOfferError("invalid_prepare_response");
  }
  if (
    (redirect.protocol !== "https:" && redirect.protocol !== "http:")
    || redirect.username !== ""
    || redirect.password !== ""
    || redirect.search !== ""
    || redirect.hash !== ""
    || redirect.pathname !== `/offer/${offerId}`
  ) {
    throw new PrepareOfferError("invalid_prepare_response");
  }

  return {
    offer_id: offerId,
    redirect_url: redirect.toString(),
  };
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
  const res = await fetch(`${baseUrl}/api/ui/offer/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  navigation.assign(result.redirect_url);
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
