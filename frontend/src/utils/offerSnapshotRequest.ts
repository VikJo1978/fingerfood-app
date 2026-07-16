"""Map frontend OfferDraft to backend snapshot/prepare payloads."""

import type { OfferDraft } from "../types";
import { offerDraftToCalculateBody } from "./api";

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
  offer_version_id: string;
  snapshot_id: string;
  schema_version: string;
}

export async function prepareOfferInCore(
  body: OfferSnapshotRequestBody
): Promise<OfferPrepareResponse> {
  const baseUrl = import.meta.env.VITE_API_URL ?? "";
  const res = await fetch(`${baseUrl}/api/offer/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Angebot konnte nicht vorbereitet werden (${res.status}): ${detail}`);
  }
  return res.json() as Promise<OfferPrepareResponse>;
}
