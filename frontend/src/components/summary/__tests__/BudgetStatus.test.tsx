/** Focused coverage for the Budget/Aktuell/Verfügbar stat card shown at
 * the top of the Offer pane, plus its "So wird gerechnet" transparency
 * breakdown. The `enabled` gate is the same pre-existing business rule as
 * before. Breakdown objects are built via the real `computeBudgetBreakdown`
 * (already exhaustively unit-tested in budgetBreakdown.test.ts) so these
 * tests only check that the UI renders exactly what that function returns,
 * for every budgetType × budgetBasis × budgetScope combination. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BudgetStatus } from "../BudgetStatus";
import type { BudgetBasis, BudgetScope, BudgetType } from "../../../types";
import { computeBudgetBreakdown } from "../../../utils/budgetBreakdown";
import { computePauschalen, computeVatBreakdown, formatCurrency } from "../../../utils/pricing";

const persons = 20;
const itemsById = {
  a: { vat_rate_percent: 7 } as never,
};
const draft = {
  persons,
  lines: [
    {
      lineId: "l1",
      itemId: "a",
      quantityMode: "total" as const,
      quantity: persons,
      snapshot: { chosen_price: 20, price_type: "piece" as const },
    },
  ],
};
const subtotal = 400; // 20 persons * 20 chosen_price
const pauschalen = computePauschalen(subtotal, persons, true);
const vat = computeVatBreakdown(draft as never, itemsById as never, pauschalen);

function makeBreakdown(budgetType: BudgetType, budgetBasis: BudgetBasis, budgetScope: BudgetScope) {
  return computeBudgetBreakdown({
    budgetType,
    budgetBasis,
    budgetScope,
    configuredAmount: budgetType === "per_person" ? 25 : 500,
    persons,
    subtotal,
    pauschalen,
    vat,
    formatCurrency,
  });
}

describe("BudgetStatus", () => {
  it("renders nothing when budget tracking is disabled", () => {
    const { container } = render(
      <BudgetStatus enabled={false} breakdown={makeBreakdown("total", "gross", "full_offer")} />
    );
    expect(container.firstChild).toBeNull();
  });

  const combinations: Array<[BudgetType, BudgetBasis, BudgetScope]> = [
    ["total", "gross", "full_offer"],
    ["total", "gross", "positions_only"],
    ["total", "net", "full_offer"],
    ["total", "net", "positions_only"],
    ["per_person", "gross", "full_offer"],
    ["per_person", "gross", "positions_only"],
    ["per_person", "net", "full_offer"],
    ["per_person", "net", "positions_only"],
  ];

  it.each(combinations)(
    "shows the correct formula, Berücksichtigt and Nicht berücksichtigt for %s/%s/%s",
    (budgetType, budgetBasis, budgetScope) => {
      const breakdown = makeBreakdown(budgetType, budgetBasis, budgetScope);
      render(<BudgetStatus enabled breakdown={breakdown} />);

      // Currency strings contain a non-breaking space that testing-library's
      // default getByText normalizer collapses on the DOM side only (not on
      // the raw query string), so an exact-string getByText query can never
      // match here — compare textContent directly instead.
      expect(screen.getByTestId("budget-formula").textContent).toBe(breakdown.formulaText);

      expect(screen.getByText("Berücksichtigt")).toBeTruthy();
      for (const line of breakdown.included) {
        expect(screen.getByText(line.label)).toBeTruthy();
      }

      if (breakdown.excluded.length) {
        expect(screen.getByText("Nicht berücksichtigt")).toBeTruthy();
        for (const line of breakdown.excluded) {
          expect(screen.getByText(line.label)).toBeTruthy();
        }
      } else {
        expect(screen.queryByText("Nicht berücksichtigt")).toBeNull();
      }

      expect(
        screen.getByText(breakdown.over ? "Budget überschritten" : /% des Budgets verwendet/)
      ).toBeTruthy();
    }
  );

  it("shows per-person Verfügbar/Überschritten and the ÷ persons line only for per_person budgets", () => {
    const breakdown = makeBreakdown("per_person", "gross", "full_offer");
    render(<BudgetStatus enabled breakdown={breakdown} />);
    expect(screen.getByText("Verfügbar pro Person")).toBeTruthy();
    expect(
      screen.getByText(`${breakdown.comparisonLabel} ÷ ${breakdown.persons} Personen`)
    ).toBeTruthy();
  });

  it("shows an absolute Verfügbar without a ÷ persons line for total budgets", () => {
    const breakdown = makeBreakdown("total", "gross", "full_offer");
    render(<BudgetStatus enabled breakdown={breakdown} />);
    expect(screen.getByText("Verfügbar")).toBeTruthy();
    expect(screen.queryByText(/÷ .* Personen/)).toBeNull();
  });

  it("shows 'Personenzahl erforderlich' and no fabricated Aktuell/Verfügbar/percentage for PER_PERSON with guest_count=0", () => {
    const breakdown = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 25,
      persons: 0,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    render(<BudgetStatus enabled breakdown={breakdown} />);
    expect(screen.getAllByText("Personenzahl erforderlich").length).toBeGreaterThan(0);
    expect(screen.getByTestId("budget-aktuell").textContent).toBe("–");
    expect(screen.getByTestId("budget-verfuegbar").textContent).toBe("–");
    expect(screen.queryByText(/% des Budgets verwendet/)).toBeNull();
    expect(screen.queryByText("Budget überschritten")).toBeNull();
  });

  it("shows 'Personenzahl erforderlich' for PER_PERSON with a missing (null) guest count", () => {
    const breakdown = computeBudgetBreakdown({
      budgetType: "per_person",
      budgetBasis: "net",
      budgetScope: "positions_only",
      configuredAmount: 25,
      persons: null,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    render(<BudgetStatus enabled breakdown={breakdown} />);
    expect(screen.getAllByText("Personenzahl erforderlich").length).toBeGreaterThan(0);
    expect(screen.getByTestId("budget-aktuell").textContent).toBe("–");
  });

  it("TOTAL budgets never show 'Personenzahl erforderlich', even with persons=0", () => {
    const breakdown = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 500,
      persons: 0,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    render(<BudgetStatus enabled breakdown={breakdown} />);
    expect(screen.queryByText("Personenzahl erforderlich")).toBeNull();
    expect(screen.getByTestId("budget-aktuell").textContent).not.toBe("–");
  });

  it("flags an over-budget total instead of showing a percentage", () => {
    const breakdown = computeBudgetBreakdown({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
      configuredAmount: 100,
      persons,
      subtotal,
      pauschalen,
      vat,
      formatCurrency,
    });
    render(<BudgetStatus enabled breakdown={breakdown} />);
    expect(screen.getByText("Budget überschritten")).toBeTruthy();
    expect(screen.queryByText(/% des Budgets verwendet/)).toBeNull();
  });
});
