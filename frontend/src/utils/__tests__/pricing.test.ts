/** Pricing unit tests + golden parity fixtures (shared with backend pytest). */
import { describe, expect, it } from "vitest";

import type { CatalogItem, PriceType, QuantityMode } from "../../types";
import { computeLineTotalFromPrice, computeOfferLineTotal, computePauschalen, lineWarnings } from "../pricing";
import fixtures from "../../../../shared/pricing_fixtures.json";

function fixtureItem(c: {
  price: number;
  price_type: string;
  min_order: number;
  unit_label: string;
}): CatalogItem {
  return {
    id: "fx-item",
    name: "Fixture Item",
    section: "Test",
    category: "Test",
    subcategory: null,
    price: c.price,
    price_type: c.price_type as PriceType,
    min_order: c.min_order,
    unit_label: c.unit_label,
    description: "",
    items_included: null,
    diet_type: "omnivore",
    ingredient_flags: undefined,
    allergens: [],
    module: "food",
    source_type: "internal",
    item_kind: "simple",
    pricing_mode: c.price_type === "piece" ? "per_piece" : "per_person",
    customization_mode: "fixed",
  };
}

describe("parity fixtures (must match backend)", () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const total = computeLineTotalFromPrice(
        c.price,
        c.price_type as PriceType,
        c.persons,
        c.quantity_mode as QuantityMode,
        c.quantity
      );
      expect(Math.round(total * 100) / 100).toBe(c.expected_total);
      const codes = lineWarnings(
        fixtureItem(c),
        c.persons,
        c.quantity_mode as QuantityMode,
        c.quantity
      ).map((w) => w.code);
      expect(codes).toEqual(c.expected_warning_codes);
    });
  }
});

describe("computeOfferLineTotal (snapshot-based)", () => {
  it("uses the snapshot price and unit basis, not the live catalog", () => {
    const line = {
      lineId: "l1",
      itemId: "fx-item",
      quantityMode: "per_person" as QuantityMode,
      quantity: 2,
      snapshot: { chosen_price: 4.5, price_type: "piece" as PriceType },
    };
    // 4.5 * 2 * 10 persons = 90 — regardless of any current catalog price
    expect(computeOfferLineTotal(line as never, 10)).toBe(90);
  });
});

describe("computePauschalen (parity fixtures, must match backend)", () => {
  for (const c of fixtures.pauschalen_cases) {
    it(c.name, () => {
      const result = computePauschalen(c.subtotal, c.persons);
      expect(result.buffetpauschale).toBe(c.expected_buffetpauschale);
      expect(result.geschirrpauschale).toBe(c.expected_geschirrpauschale);
      expect(result.anlieferung).toBe(c.expected_anlieferung);
      expect(result.grandTotal).toBe(c.expected_grand_total);
    });
  }
});
