import { describe, expect, it } from "vitest";
import { computeBudgetBreakdown } from "../budgetBreakdown";
import { computePauschalen, computeVatBreakdown, formatCurrency } from "../pricing";
import type { CatalogItem, OfferDraft } from "../../types";
import { createInitialOfferDraft } from "../../types";

/** 954,00 € Positionen (matches the task's worked example numbers closely
 * enough to sanity-check against): one 7%-rate item line. */
const item7: CatalogItem = {
  id: "item-7",
  name: "Speise",
  section: "Test",
  category: "Test",
  subcategory: null,
  price: 31.8,
  price_type: "piece",
  min_order: 1,
  unit_label: "Person",
  description: "",
  items_included: null,
  vat_rate_percent: 7,
  module: "food",
  source_type: "internal",
  item_kind: "simple",
  pricing_mode: "per_person",
  customization_mode: "fixed",
};

function draftWithOneLine(persons: number): OfferDraft {
  const base = createInitialOfferDraft();
  return {
    ...base,
    persons,
    lines: [
      {
        lineId: "line-1",
        itemId: "item-7",
        quantityMode: "per_person",
        quantity: 1,
        snapshot: {
          title: item7.name,
          source_type: "internal",
          pricing_mode: "per_person",
          price_type: "person",
          chosen_price: item7.price,
          item_kind: "simple",
        },
      },
    ],
  };
}

function computeAll(persons: number) {
  const draft = draftWithOneLine(persons);
  const itemsById = { [item7.id]: item7 };
  const subtotal = 31.8 * persons; // computeOfferLineTotal for a per_person piece line
  const pauschalen = computePauschalen(subtotal, persons, true);
  const vat = computeVatBreakdown(draft, itemsById, pauschalen);
  return { subtotal, pauschalen, vat };
}

describe("computeBudgetBreakdown — worked examples from the task spec", () => {
  it("PER_PERSON + GROSS + FULL_OFFER matches the exact worked example", () => {
    const persons = 30;
    const { subtotal, pauschalen, vat } = computeAll(persons);
    const result = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 35,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });

    expect(result.absoluteBudget).toBe(1050);
    // Built via formatCurrency rather than a hand-typed literal: Intl's
    // de-DE currency format uses a non-breaking space before "€", which a
    // literal in this file would easily (and did, once) get wrong.
    expect(result.formulaText).toBe(
      `${formatCurrency(35)} × 30 Personen = ${formatCurrency(1050)}`
    );
    expect(result.comparisonLabel).toBe("Aktuell (brutto)");
    expect(result.comparisonAbsolute).toBe(vat.totalInclVat);
    expect(result.comparisonPerPerson).toBeCloseTo(vat.totalInclVat / persons, 5);
    expect(result.included.map((l) => l.label)).toEqual([
      "Positionen (Speisen etc.) netto",
      "Pauschalen (Büffet, Geschirr, Anlieferung)",
      "MwSt.",
    ]);
    expect(result.excluded).toEqual([]);
  });

  it("PER_PERSON + NET + POSITIONS_ONLY matches the exact worked example", () => {
    const persons = 30;
    const { subtotal, pauschalen, vat } = computeAll(persons);
    const result = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "net",
      budgetScope: "positions_only",
      configuredAmount: 20,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });

    expect(result.comparisonLabel).toBe("Speisen (netto)");
    expect(result.comparisonAbsolute).toBe(subtotal);
    expect(result.comparisonPerPerson).toBeCloseTo(subtotal / persons, 5);
    expect(result.included).toEqual([{ label: "Positionen (Speisen etc.) netto", amount: subtotal }]);
    // Pauschalen, delivery (Anlieferung) and VAT explicitly not included.
    expect(result.excluded.map((l) => l.label)).toEqual([
      "Pauschalen (Büffet, Geschirr, Anlieferung)",
      "Anlieferung",
      "MwSt.",
    ]);
  });
});

describe("computeBudgetBreakdown — every scope/basis combination", () => {
  const persons = 20;
  const { subtotal, pauschalen, vat } = computeAll(persons);

  it("full_offer + gross includes Positionen, Pauschalen and MwSt., nothing excluded", () => {
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 2000,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.included.map((l) => l.label)).toContain("MwSt.");
    expect(r.excluded).toEqual([]);
    expect(r.comparisonAbsolute).toBe(vat.totalInclVat);
  });

  it("full_offer + net includes Positionen and Pauschalen, excludes MwSt.", () => {
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "net",
      budgetScope: "full_offer",
      configuredAmount: 2000,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.included.map((l) => l.label)).toEqual([
      "Positionen (Speisen etc.) netto",
      "Pauschalen (Büffet, Geschirr, Anlieferung)",
    ]);
    expect(r.excluded).toEqual([{ label: "MwSt." }]);
    expect(r.comparisonAbsolute).toBe(pauschalen.grandTotal);
  });

  it("positions_only + net includes only Positionen, excludes Pauschalen/Anlieferung/MwSt.", () => {
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "net",
      budgetScope: "positions_only",
      configuredAmount: 2000,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.included).toEqual([{ label: "Positionen (Speisen etc.) netto", amount: subtotal }]);
    expect(r.excluded.map((l) => l.label)).toEqual([
      "Pauschalen (Büffet, Geschirr, Anlieferung)",
      "Anlieferung",
      "MwSt.",
    ]);
    expect(r.comparisonAbsolute).toBe(subtotal);
  });

  it("positions_only + gross includes Positionen incl. MwSt., excludes Pauschalen/Anlieferung", () => {
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "positions_only",
      configuredAmount: 2000,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.included.map((l) => l.label)).toEqual(["Positionen (Speisen etc.) inkl. MwSt."]);
    expect(r.excluded.map((l) => l.label)).toEqual([
      "Pauschalen (Büffet, Geschirr, Anlieferung)",
      "Anlieferung",
    ]);
    // Positions-only gross must be strictly between the netto positions
    // total and the full brutto total (it adds VAT on items but not on
    // Pauschalen) — a sanity bound instead of duplicating the formula.
    expect(r.comparisonAbsolute).toBeGreaterThan(subtotal);
    expect(r.comparisonAbsolute).toBeLessThan(vat.totalInclVat);
  });
});

describe("computeBudgetBreakdown — budgetType affects units, not included/excluded", () => {
  const persons = 20;
  const { subtotal, pauschalen, vat } = computeAll(persons);

  it("total type compares the absolute configured amount against the absolute comparison total", () => {
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 1200,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.absoluteBudget).toBe(1200);
    expect(r.remaining).toBeCloseTo(1200 - vat.totalInclVat, 5);
    expect(r.formulaText).toBe(formatCurrency(1200));
  });

  it("over-budget is flagged correctly for both budget types", () => {
    const totalR = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 1,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(totalR.over).toBe(true);

    const perPersonR = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 0.01,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(perPersonR.over).toBe(true);
  });

  it("does not divide by zero when persons is 0", () => {
    const r = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 35,
      persons: 0,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(Number.isFinite(r.comparisonPerPerson)).toBe(true);
    expect(Number.isFinite(r.remaining)).toBe(true);
  });
});
