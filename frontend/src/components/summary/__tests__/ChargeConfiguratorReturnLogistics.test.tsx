import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialChargesDefinition } from "../../../types";
import { ChargeConfiguratorModal } from "../ChargeConfiguratorModal";

describe("ChargeConfiguratorModal return logistics", () => {
  it("renders through a body portal with the overlay as the Safari-safe scroll container", () => {
    const charges = createInitialChargesDefinition();
    render(
      <ChargeConfiguratorModal
        open
        charges={charges}
        persons={20}
        onClose={() => undefined}
        onChange={() => undefined}
        createLineId={() => "line-1"}
      />
    );

    const overlay = screen.getByTestId("charge-configurator-overlay");
    const dialog = screen.getByRole("dialog", { name: "Pauschalen & Lieferung" });

    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.className).toContain("overflow-y-auto");
    expect(overlay.className).toContain("overscroll-contain");
    expect(dialog.parentElement).toBe(overlay);
    expect(screen.getByTestId("charge-configurator-content")).toBeTruthy();
  });

  it("shows pickup window and surcharge only for SAME_DAY", () => {
    const onChange = vi.fn();
    const charges = createInitialChargesDefinition();
    const { rerender } = render(
      <ChargeConfiguratorModal
        open
        charges={charges}
        persons={20}
        onClose={() => undefined}
        onChange={onChange}
        createLineId={() => "line-1"}
      />
    );

    expect(screen.queryByLabelText("Abholfenster Rückholung")).toBeNull();
    fireEvent.change(screen.getByLabelText("Rückholmodus"), {
      target: { value: "SAME_DAY" },
    });
    expect(onChange).toHaveBeenCalled();

    const sameDay = {
      ...charges,
      returnLogistics: {
        mode: "SAME_DAY" as const,
        pickupWindowText: null,
        sameDayFeeCents: 0,
      },
    };
    rerender(
      <ChargeConfiguratorModal
        open
        charges={sameDay}
        persons={20}
        onClose={() => undefined}
        onChange={onChange}
        createLineId={() => "line-1"}
      />
    );
    expect(screen.getByLabelText("Abholfenster Rückholung")).toBeTruthy();
    expect(screen.getByLabelText("Abholung Rückholung von")).toBeTruthy();
    expect(screen.getByLabelText("Abholung Rückholung bis")).toBeTruthy();
    expect(screen.getByText(/Abholfenster für Rückholung/)).toBeTruthy();
    expect(screen.getByText("Aufpreis Rückholung netto")).toBeTruthy();
  });
});
