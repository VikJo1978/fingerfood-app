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
    expect(result.included).toEqual([
      { label: "Positionen (Speisen etc.) netto", amount: subtotal },
    ]);
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
});

/** Cross-repo parity requirement: Core's `compute_offer_budget_presentation`
 * returns `comparison_amount_cents=None`/`remaining_cents=None`/`over=None`
 * for `budgetType === PER_PERSON` when `guest_count is None or guest_count
 * <= 0` — it never assumes a guest count of 1. This mirrors that exactly:
 * no fabricated Aktuell/Verfügbar value, ever, for a missing/invalid guest
 * count. TOTAL is asserted to be entirely unaffected in every case, since
 * it never divides by persons (matches Core's TOTAL branch, which never
 * even looks at guest_count). */
describe("computeBudgetBreakdown — PER_PERSON guest-count parity with Core", () => {
  const persons = 20;
  const { subtotal, pauschalen, vat } = computeAll(persons);

  it.each([
    ["guest_count = 0", 0],
    ["guest_count missing (null)", null],
  ] as const)("%s: personsRequired is true, nothing is fabricated", (_label, invalidPersons) => {
    const r = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 35,
      persons: invalidPersons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.personsRequired).toBe(true);
    expect(r.comparisonPerPerson).toBeNull();
    expect(r.remaining).toBeNull();
    expect(r.over).toBeNull();
    expect(r.absoluteBudget).toBeNull();
    expect(r.pctUsed).toBeNull();
    expect(r.barPct).toBe(0);
    expect(r.formulaText).toContain("Personenzahl erforderlich");
    // comparisonAbsolute never depends on persons — still fully computed.
    expect(r.comparisonAbsolute).toBe(vat.totalInclVat);
  });

  it.each([
    ["guest_count = 1", 1],
    ["guest_count = 30 (normal positive)", 30],
  ] as const)(
    "%s: personsRequired is false, a real comparison is shown",
    (_label, validPersons) => {
      const r = computeBudgetBreakdown({
        budgetType: "per_person",
        budgetBasis: "gross",
        budgetScope: "full_offer",
        configuredAmount: 35,
        persons: validPersons,
        subtotal,
        pauschalen,
        vat,
        formatCurrency,
      });
      expect(r.personsRequired).toBe(false);
      expect(r.comparisonPerPerson).toBeCloseTo(vat.totalInclVat / validPersons, 5);
      expect(r.remaining).not.toBeNull();
      expect(r.over).not.toBeNull();
      expect(typeof r.pctUsed).toBe("number");
    }
  );

  it("TOTAL budgets are entirely unaffected by guest_count = 0 or missing", () => {
    for (const invalidPersons of [0, null] as const) {
      const r = computeBudgetBreakdown({
        budgetType: "total",
        budgetBasis: "gross",
        budgetScope: "full_offer",
        configuredAmount: 2000,
        persons: invalidPersons,
        subtotal,
        pauschalen,
        vat,
        formatCurrency,
      });
      expect(r.personsRequired).toBe(false);
      expect(r.absoluteBudget).toBe(2000);
      expect(r.remaining).toBeCloseTo(2000 - vat.totalInclVat, 5);
      expect(r.over).not.toBeNull();
    }
  });
});

describe("computeBudgetBreakdown — exact-equality and rounding-boundary currency comparison", () => {
  const persons = 20;
  const { subtotal, pauschalen, vat } = computeAll(persons);

  it("TOTAL: budget exactly equal to the comparison total shows remaining=0, not exceeded", () => {
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: vat.totalInclVat,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.remaining).toBe(0);
    expect(r.over).toBe(false);
  });

  it("PER_PERSON: budget exactly equal to the per-person comparison shows remaining=0, not exceeded", () => {
    // Deliberately not a "nice" 2-decimal amount — a raw division result,
    // to prove the comparison itself (not just a pre-rounded fixture) is
    // what's being asserted as an exact match.
    const perPersonExact = vat.totalInclVat / persons;
    const r = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: perPersonExact,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.remaining).toBe(0);
    expect(r.over).toBe(false);
  });

  it("a fraction-of-a-cent surplus rounds to 0,00 € remaining without flipping to exceeded", () => {
    // 1/3 cent below the true total — well inside "this is really the
    // same amount" territory for a currency display, must not read as
    // exceeded purely from float residue.
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: vat.totalInclVat - 0.003,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.remaining).toBe(0);
    expect(r.over).toBe(false);
  });

  it("a fraction-of-a-cent shortfall rounds to 0,00 € and stays over (never masks a real shortfall)", () => {
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: vat.totalInclVat - 0.006,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.remaining).toBe(-0.01);
    expect(r.over).toBe(true);
  });

  it("remaining is always rounded to whole cents (deterministic currency comparison)", () => {
    const r = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "net",
      budgetScope: "positions_only",
      configuredAmount: 17,
      persons: 7, // deliberately a non-round divisor
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(r.remaining).not.toBeNull();
    const remaining = r.remaining as number;
    const cents = Math.round(remaining * 100);
    expect(cents / 100).toBeCloseTo(remaining, 10);
  });

  it("pctUsed/barPct are precomputed on the breakdown, not left for the component to derive", () => {
    const r = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 1000,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    expect(typeof r.pctUsed).toBe("number");
    expect(r.barPct).toBeGreaterThanOrEqual(0);
    expect(r.barPct).toBeLessThanOrEqual(100);
  });
});
