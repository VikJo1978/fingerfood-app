/** Pricing unit tests + golden parity fixtures (shared with backend pytest). */
import { describe, expect, it } from "vitest";

import type { CatalogItem, PriceType, QuantityMode } from "../../types";
import {
  computeLineTotal,
  computeLineTotalFromPrice,
  computeOfferLineTotal,
  computePauschalen,
  computePositionsOnlyGross,
  computeVatBreakdown,
  lineWarnings,
} from "../pricing";
import fixtures from "../../../../shared/pricing_fixtures.json";

function fixtureItem(c: {
  price: number;
  price_type: string;
  min_order: number;
  unit_label: string;
  surcharge_amount?: number | null;
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
    surcharge_label: c.surcharge_amount != null ? "Lachs oder Rind" : null,
    surcharge_amount: c.surcharge_amount ?? null,
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

describe("surcharge parity fixtures (must match backend)", () => {
  // Prices/quantities mirror the real catalog items (Brötchen Mix 3 2,60€,
  // Sandwiches 3,30€, Bagels 3,45€) with their "+1,00 € Aufpreis für Lachs
  // oder Rind" checkbox.
  for (const c of fixtures.surcharge_cases) {
    it(c.name, () => {
      const item = fixtureItem(c);
      const total = computeLineTotal(
        item,
        c.persons,
        c.quantity_mode as QuantityMode,
        c.quantity,
        c.surcharge_selected
      );
      expect(Math.round(total * 100) / 100).toBe(c.expected_total);
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

  it("adds the snapshotted surcharge only when surchargeSelected was frozen true", () => {
    // Real item: Brötchen Mix 3, 2,60 €/Stück, "+1,00 € Aufpreis für Lachs oder Rind".
    const lineOff = {
      lineId: "l1",
      itemId: "broetchen-mix-3",
      quantityMode: "total" as QuantityMode,
      quantity: 10,
      snapshot: {
        chosen_price: 2.6,
        price_type: "piece" as PriceType,
        surchargeSelected: false,
        surchargeLabel: "Lachs oder Rind",
        surchargeAmount: 1.0,
      },
    };
    const lineOn = { ...lineOff, snapshot: { ...lineOff.snapshot, surchargeSelected: true } };
    expect(computeOfferLineTotal(lineOff as never, 10)).toBe(26.0);
    expect(computeOfferLineTotal(lineOn as never, 10)).toBe(36.0);
  });
});

describe("VAT arithmetic (parity fixtures, must match backend)", () => {
  for (const c of fixtures.vat_cases) {
    it(c.name, () => {
      const vat7 = Math.round(c.vat7_base * 0.07 * 100) / 100;
      const vat19 = Math.round(c.vat19_base * 0.19 * 100) / 100;
      const totalIncl = Math.round((c.grand_total + vat7 + vat19) * 100) / 100;
      expect(vat7).toBe(c.expected_vat7_amount);
      expect(vat19).toBe(c.expected_vat19_amount);
      expect(totalIncl).toBe(c.expected_total_incl_vat);
    });
  }
});

describe("computePauschalen (parity fixtures, must match backend)", () => {
  for (const c of fixtures.pauschalen_cases) {
    it(c.name, () => {
      const result = computePauschalen(c.subtotal, c.persons, c.has_lines);
      expect(result.buffetpauschale).toBe(c.expected_buffetpauschale);
      expect(result.geschirrpauschale).toBe(c.expected_geschirrpauschale);
      expect(result.anlieferung).toBe(c.expected_anlieferung);
      expect(result.grandTotal).toBe(c.expected_grand_total);
    });
  }
});

describe("computeVatBreakdown", () => {
  it("splits lines by item vat_rate_percent and adds Pauschalen at 19%", () => {
    const itemsById = {
      a: fixtureItem({ price: 2, price_type: "piece", min_order: 1, unit_label: "Stück" }),
      b: fixtureItem({ price: 3, price_type: "piece", min_order: 1, unit_label: "Stück" }),
    };
    (itemsById.a as any).vat_rate_percent = 7;
    (itemsById.b as any).vat_rate_percent = 19;
    const draft = {
      persons: 10,
      lines: [
        {
          lineId: "l1",
          itemId: "a",
          quantityMode: "total" as const,
          quantity: 10,
          snapshot: { chosen_price: 2, price_type: "piece" as PriceType },
        },
        {
          lineId: "l2",
          itemId: "b",
          quantityMode: "total" as const,
          quantity: 10,
          snapshot: { chosen_price: 3, price_type: "piece" as PriceType },
        },
      ],
    };
    const pauschalen = {
      buffetpauschale: 5,
      geschirrpauschale: 20,
      anlieferung: 35,
      dishwareAdditional: 0,
      grandTotal: 110,
    };
    const result = computeVatBreakdown(draft as never, itemsById as never, pauschalen);
    expect(result.vat7Base).toBe(20);
    expect(result.vat7Amount).toBe(1.4);
    expect(result.vat19Base).toBe(90); // 30 line + 60 Pauschalen
    expect(result.vat19Amount).toBe(17.1);
    expect(result.totalInclVat).toBe(128.5);
  });
});

describe("computePositionsOnlyGross", () => {
  it("excludes Pauschalen and their VAT — items' own price + items' own VAT only", () => {
    // Same fixture as the mixed-rate computeVatBreakdown case above:
    // subtotal (items only) = 20 (7%-rate line) + 30 (19%-rate line) = 50;
    // vat19Base = 90 includes 60 of Pauschalen mixed in, so items-only 19%
    // base is 90 - 60 = 30 -> 5.70 VAT; 7%-rate VAT is already items-only
    // (1.40, per the case above, since Pauschalen are never added to the
    // 7% bucket). Expected: 50 + 1.40 + 5.70 = 57.10.
    const subtotal = 50;
    const vat = {
      vat7Base: 20,
      vat7Amount: 1.4,
      vat19Base: 90,
      vat19Amount: 17.1,
      totalInclVat: 128.5,
    };
    const pauschalen = {
      buffetpauschale: 5,
      geschirrpauschale: 20,
      anlieferung: 35,
      dishwareAdditional: 0,
      grandTotal: 110,
    };
    expect(computePositionsOnlyGross(subtotal, vat, pauschalen)).toBe(57.1);
  });

  it("is strictly between the netto positions subtotal and the full brutto total whenever Pauschalen exist", () => {
    const subtotal = 500;
    const vat = {
      vat7Base: 500,
      vat7Amount: 35,
      vat19Base: 60,
      vat19Amount: 11.4,
      totalInclVat: 606.4,
    };
    const pauschalen = {
      buffetpauschale: 20,
      geschirrpauschale: 40,
      anlieferung: 35,
      dishwareAdditional: 0,
      grandTotal: 595,
    };
    const positionsGross = computePositionsOnlyGross(subtotal, vat, pauschalen);
    expect(positionsGross).toBeGreaterThan(subtotal);
    expect(positionsGross).toBeLessThan(vat.totalInclVat);
  });

  it("equals the plain subtotal when there are no positions (zero VAT bases)", () => {
    const vat = { vat7Base: 0, vat7Amount: 0, vat19Base: 0, vat19Amount: 0, totalInclVat: 0 };
    const pauschalen = {
      buffetpauschale: 0,
      geschirrpauschale: 0,
      anlieferung: 0,
      dishwareAdditional: 0,
      grandTotal: 0,
    };
    expect(computePositionsOnlyGross(0, vat, pauschalen)).toBe(0);
  });
});
