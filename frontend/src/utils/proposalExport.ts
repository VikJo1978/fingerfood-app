/**
 * Büro-Export: proposal_payload_v1 for the catering-repo Office Panel's
 * read-only /proposal-preview (CONFIGURATOR_OFFICE_MANUAL_HANDOFF_PACK_V1 in
 * the silberlöffelcatering repo, frozen 334cd11).
 *
 * Boundary: the exported JSON is proposal data only — it never becomes Core
 * truth by being exported or previewed. This module is a pure mapping over the
 * in-memory OfferDraft: no fetch, no persistence, no Office Panel or Core
 * call. The manual flow is download → office worker pastes it into the Office
 * Panel preview → office manually creates Core data (a separate, future,
 * office-side step — not this app's job).
 */

import type { CatalogItem, OfferDraft } from "../types";
import { computeOfferLineTotal } from "./pricing";

export const PROPOSAL_PAYLOAD_SCHEMA_VERSION = "proposal_payload_v1";
export const PROPOSAL_PAYLOAD_SOURCE = "fingerfood-configurator";

export interface ProposalPayloadItemV1 {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
}

export interface ProposalPayloadV1 {
  schema_version: typeof PROPOSAL_PAYLOAD_SCHEMA_VERSION;
  source: typeof PROPOSAL_PAYLOAD_SOURCE;
  proposal_id?: string;
  title: string;
  event_date: string;
  guest_count: number;
  selected_items: ProposalPayloadItemV1[];
  calculated_total_net: number;
  calculated_total_gross: number;
  notes: string;
}

/**
 * Map the in-memory draft to proposal_payload_v1.
 *
 * Quantity semantics mirror computeOfferLineTotal: `total` mode exports the
 * configured quantity, `per_person` exports quantity × persons. A selected
 * surcharge is folded into unit_price (same per-unit basis as the price), so
 * quantity × unit_price equals total_price within rounding tolerance.
 */
export function buildProposalPayloadV1(
  draft: OfferDraft,
  itemsById: Record<string, CatalogItem>,
  calculatedTotalNet: number,
  calculatedTotalGross: number,
  draftId: string | null
): ProposalPayloadV1 {
  const selectedItems = draft.lines.map((line) => {
    const quantity =
      line.quantityMode === "total" ? line.quantity : line.quantity * draft.persons;
    const surcharge = line.snapshot.surchargeSelected
      ? (line.snapshot.surchargeAmount ?? 0)
      : 0;
    const note = line.customizationNote?.trim();
    return {
      name: itemsById[line.itemId]?.name ?? line.snapshot.title,
      quantity,
      unit_price: line.snapshot.chosen_price + surcharge,
      total_price: computeOfferLineTotal(line, draft.persons),
      ...(note ? { notes: note } : {}),
    };
  });
  const title = draft.orderContext.companyName.trim() || "Angebot (ohne Titel)";
  return {
    schema_version: PROPOSAL_PAYLOAD_SCHEMA_VERSION,
    source: PROPOSAL_PAYLOAD_SOURCE,
    ...(draftId ? { proposal_id: draftId } : {}),
    title,
    event_date: draft.orderContext.eventDate,
    // UI clamps persons to an integer >= 1 already; re-clamp defensively so an
    // exported payload can never fail the Office Panel's guest_count check.
    guest_count: Math.max(1, Math.round(draft.persons) || 1),
    selected_items: selectedItems,
    calculated_total_net: calculatedTotalNet,
    calculated_total_gross: calculatedTotalGross,
    notes: draft.orderContext.remarks?.trim() ?? "",
  };
}
