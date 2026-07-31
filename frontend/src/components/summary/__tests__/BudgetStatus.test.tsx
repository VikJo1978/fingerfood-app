/** Focused coverage for the Budget/Aktuell/Verfügbar stat card shown at
 * the top of the Offer pane (approved split-screen mockup). The `enabled`
 * gate is the same pre-existing business rule as before — only the
 * presentation (now comparing against the brutto total, not just the
 * Positionen subtotal) is new. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BudgetStatus } from "../BudgetStatus";

describe("BudgetStatus", () => {
  it("renders nothing when budget tracking is disabled", () => {
    const { container } = render(
      <BudgetStatus enabled={false} totalBudget={1000} currentTotal={500} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows Budget, Aktuell (brutto) and Verfügbar when enabled", () => {
    render(<BudgetStatus enabled totalBudget={1200} currentTotal={1093.25} />);
    expect(screen.getByText("Budget")).toBeTruthy();
    expect(screen.getByText("Aktuell (brutto)")).toBeTruthy();
    expect(screen.getByText("Verfügbar")).toBeTruthy();
    expect(screen.getByText("1.200,00 €")).toBeTruthy();
    expect(screen.getByText("1.093,25 €")).toBeTruthy();
    expect(screen.getByText("106,75 €")).toBeTruthy();
  });

  it("shows the used percentage when under budget", () => {
    render(<BudgetStatus enabled totalBudget={1200} currentTotal={1093.25} />);
    expect(screen.getByText("91% des Budgets verwendet")).toBeTruthy();
  });

  it("flags an over-budget total instead of showing a percentage", () => {
    render(<BudgetStatus enabled totalBudget={1000} currentTotal={1200} />);
    expect(screen.getByText("Budget überschritten")).toBeTruthy();
    expect(screen.queryByText(/% des Budgets verwendet/)).toBeNull();
  });
});
