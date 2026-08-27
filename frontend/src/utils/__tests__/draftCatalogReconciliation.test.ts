import { describe, expect, it } from "vitest";
import type { CatalogItem, OfferLine } from "../../types";
import { createInitialOfferDraft } from "../../types";
import { reconcileDraftCatalogLines } from "../draftCatalogReconciliation";

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "current-id",
    name: "Lunch Buffet No 3",
    section: "Buffets",
    category: "Buffet",
    price: 29.5,
    price_type: "person",
    min_order: 10,
    unit_label: "Person",
    description: "Test",
    module: "food",
    source_type: "internal",
    item_kind: "composite",
    pricing_mode: "per_person",
    customization_mode: "fixed",
    ...overrides,
  };
}

function line(overrides: Partial<OfferLine> = {}): OfferLine {
  return {
    lineId: "line-1",
    itemId: "legacy-id",
    quantityMode: "total",
    quantity: 10,
    snapshot: {
      title: "Lunch Buffet No 3",
      source_type: "internal",
      pricing_mode: "per_person",
      price_type: "person",
      chosen_price: 27.5,
      item_kind: "composite",
    },
    ...overrides,
  };
}

describe("reconcileDraftCatalogLines", () => {
  it("rebinds a stale id by its exact unique title and refreshes commercial facts", () => {
    const draft = { ...createInitialOfferDraft(), lines: [line()] };

    const result = reconcileDraftCatalogLines(draft, [item()]);

    expect(result.unresolvedTitles).toEqual([]);
    expect(result.reconciledTitles).toEqual(["Lunch Buffet No 3"]);
    expect(result.draft.lines[0].itemId).toBe("current-id");
    expect(result.draft.lines[0].snapshot.chosen_price).toBe(29.5);
  });

  it("leaves a current catalog id untouched", () => {
    const current = line({ itemId: "current-id" });
    const draft = { ...createInitialOfferDraft(), lines: [current] };

    const result = reconcileDraftCatalogLines(draft, [item()]);

    expect(result.reconciledTitles).toEqual([]);
    expect(result.unresolvedTitles).toEqual([]);
    expect(result.draft.lines[0]).toBe(current);
  });

  it("does not guess when an old title is absent", () => {
    const draft = { ...createInitialOfferDraft(), lines: [line()] };

    const result = reconcileDraftCatalogLines(draft, [
      item({ id: "other-id", name: "Anderes Buffet" }),
    ]);

    expect(result.reconciledTitles).toEqual([]);
    expect(result.unresolvedTitles).toEqual(["Lunch Buffet No 3"]);
    expect(result.draft.lines[0].itemId).toBe("legacy-id");
  });
});
