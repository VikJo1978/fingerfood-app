import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TopControls } from "../TopControls";

function ControlledBudget({ initial = 0 }: { initial?: number }) {
  const [budget, setBudget] = useState(initial);

  return (
    <TopControls
      persons={25}
      onPersonsChange={() => undefined}
      budgetEnabled
      onBudgetEnabledChange={() => undefined}
      totalBudget={budget}
      onTotalBudgetChange={setBudget}
      budgetType="total"
      onBudgetTypeChange={() => undefined}
      budgetBasis="gross"
      onBudgetBasisChange={() => undefined}
      budgetScope="full_offer"
      onBudgetScopeChange={() => undefined}
    />
  );
}

function budgetInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Gesamtbudget" }) as HTMLInputElement;
}

describe("TopControls budget input", () => {
  it("normalizes a leading zero while typing 01000 to 1000", () => {
    render(<ControlledBudget initial={0} />);
    const input = budgetInput();

    fireEvent.change(input, { target: { value: "01000" } });

    expect(input.value).toBe("1000");
    expect(screen.getByText("40,00 €")).toBeTruthy();
  });

  it("selects the existing budget on focus so replacement typing is natural", () => {
    render(<ControlledBudget initial={0} />);
    const input = budgetInput();
    const selectSpy = vi.spyOn(input, "select");

    fireEvent.focus(input);

    expect(selectSpy).toHaveBeenCalledOnce();
  });

  it("allows a temporary empty value and commits it to zero on blur", () => {
    render(<ControlledBudget initial={1000} />);
    const input = budgetInput();

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");

    fireEvent.blur(input);
    expect(input.value).toBe("0");
  });

  it("uses controlled numeric text instead of the browser number spinner", () => {
    render(<ControlledBudget initial={1000} />);
    const input = budgetInput();

    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("numeric");
  });
});
