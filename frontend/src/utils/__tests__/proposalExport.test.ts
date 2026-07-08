/** Büro-Export (proposal_payload_v1) — pure mapping, must never touch Core. */
import { describe, expect, it, vi } from "vitest";

import type { CatalogItem, OfferDraft, OfferLine } from "../../types";
import { createInitialOfferDraft } from "../../types";
import { computeOfferLineTotal } from "../pricing";
import {
  buildProposalPayloadV1,
  PROPOSAL_PAYLOAD_SCHEMA_VERSION,
  PROPOSAL_PAYLOAD_SOURCE,
} from "../proposalExport";

function makeLine(overrides: Partial<OfferLine> = {}): OfferLine {
  return {
    lineId: "L1",
    itemId: "item-1",
    quantityMode: "total",
    quantity: 30,
    snapshot: {
      title: "Mini Wraps",
      source_type: "internal",
      pricing_mode: "per_piece",
      price_type: "piece",
      chosen_price: 2.9,
    },
    ...overrides,
  };
}

function makeDraft(overrides: Partial<OfferDraft> = {}): OfferDraft {
  const draft = createInitialOfferDraft();
  return {
    ...draft,
    persons: 30,
    orderContext: {
      ...draft.orderContext,
      companyName: "Musterfirma GmbH",
      eventDate: "2026-09-12",
    },
    lines: [makeLine()],
    ...overrides,
  };
}

function build(draft: OfferDraft, draftId: string | null = null) {
  return buildProposalPayloadV1(draft, {}, 87.0, 103.53, draftId);
}

describe("buildProposalPayloadV1", () => {
  it("stamps schema_version and source", () => {
    const payload = build(makeDraft());
    expect(payload.schema_version).toBe("proposal_payload_v1");
    expect(payload.source).toBe("fingerfood-configurator");
    expect(payload.schema_version).toBe(PROPOSAL_PAYLOAD_SCHEMA_VERSION);
    expect(payload.source).toBe(PROPOSAL_PAYLOAD_SOURCE);
  });

  it("exports guest_count as integer >= 1", () => {
    const payload = build(makeDraft());
    expect(payload.guest_count).toBe(30);
    expect(Number.isInteger(payload.guest_count)).toBe(true);
    expect(payload.guest_count).toBeGreaterThanOrEqual(1);
  });

  it("exports selected_items as a list with non-empty names", () => {
    const payload = build(makeDraft());
    expect(Array.isArray(payload.selected_items)).toBe(true);
    expect(payload.selected_items).toHaveLength(1);
    expect(payload.selected_items[0].name).toBe("Mini Wraps");
    expect(payload.selected_items[0].name.trim().length).toBeGreaterThan(0);
  });

  it("prefers the current catalog name and falls back to the snapshot title", () => {
    const catalog = { id: "item-1", name: "Mini Wraps (aktuell)" } as CatalogItem;
    const withCatalog = buildProposalPayloadV1(makeDraft(), { "item-1": catalog }, 0, 0, null);
    expect(withCatalog.selected_items[0].name).toBe("Mini Wraps (aktuell)");
    const withoutCatalog = build(makeDraft());
    expect(withoutCatalog.selected_items[0].name).toBe("Mini Wraps");
  });

  it("includes the calculated totals as passed in", () => {
    const payload = build(makeDraft());
    expect(payload.calculated_total_net).toBe(87.0);
    expect(payload.calculated_total_gross).toBe(103.53);
  });

  it("exports the configured quantity in total mode", () => {
    const payload = build(makeDraft());
    const item = payload.selected_items[0];
    expect(item.quantity).toBe(30);
    expect(item.unit_price).toBe(2.9);
    expect(item.total_price).toBeCloseTo(87.0, 2);
  });

  it("exports quantity × persons in per_person mode", () => {
    const draft = makeDraft({
      persons: 10,
      lines: [makeLine({ quantityMode: "per_person", quantity: 2 })],
    });
    const item = build(draft).selected_items[0];
    expect(item.quantity).toBe(20);
    expect(item.total_price).toBeCloseTo(computeOfferLineTotal(draft.lines[0], 10), 2);
    expect(item.quantity * item.unit_price).toBeCloseTo(item.total_price, 2);
  });

  it("folds a selected surcharge into unit_price so quantity × unit_price == total_price", () => {
    const line = makeLine({
      snapshot: {
        title: "Brötchen Mix 3",
        source_type: "internal",
        pricing_mode: "per_piece",
        price_type: "piece",
        chosen_price: 2.9,
        surchargeSelected: true,
        surchargeLabel: "Lachs oder Rind",
        surchargeAmount: 1.0,
      },
    });
    const draft = makeDraft({ lines: [line] });
    const item = build(draft).selected_items[0];
    expect(item.unit_price).toBeCloseTo(3.9, 2);
    expect(item.total_price).toBeCloseTo(computeOfferLineTotal(line, draft.persons), 2);
    expect(item.quantity * item.unit_price).toBeCloseTo(item.total_price, 2);
  });

  it("ignores an unselected surcharge", () => {
    const line = makeLine({
      snapshot: {
        title: "Brötchen Mix 3",
        source_type: "internal",
        pricing_mode: "per_piece",
        price_type: "piece",
        chosen_price: 2.9,
        surchargeSelected: false,
        surchargeLabel: "Lachs oder Rind",
        surchargeAmount: 1.0,
      },
    });
    const item = build(makeDraft({ lines: [line] })).selected_items[0];
    expect(item.unit_price).toBe(2.9);
  });

  it("includes per-line customization notes and omits the key when absent", () => {
    const noted = makeLine({ customizationNote: "  ohne Koriander  " });
    const withNote = build(makeDraft({ lines: [noted] })).selected_items[0];
    expect(withNote.notes).toBe("ohne Koriander");
    const withoutNote = build(makeDraft()).selected_items[0];
    expect("notes" in withoutNote).toBe(false);
  });

  it("exports remarks as top-level notes, empty string when absent", () => {
    const draft = makeDraft();
    draft.orderContext.remarks = "Freitext aus Angebotsphase";
    expect(build(draft).notes).toBe("Freitext aus Angebotsphase");
    expect(build(makeDraft()).notes).toBe("");
  });

  it("omits proposal_id without a draft id and includes it with one", () => {
    expect("proposal_id" in build(makeDraft(), null)).toBe(false);
    expect(build(makeDraft(), "draft-7").proposal_id).toBe("draft-7");
  });

  it("falls back to a placeholder title when companyName is empty", () => {
    const draft = makeDraft();
    draft.orderContext.companyName = "   ";
    expect(build(draft).title).toBe("Angebot (ohne Titel)");
  });

  it("passes event_date through unchanged", () => {
    expect(build(makeDraft()).event_date).toBe("2026-09-12");
  });

  it("performs no IO — no fetch, nothing sent to Office Panel or Core", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    build(makeDraft(), "draft-7");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
