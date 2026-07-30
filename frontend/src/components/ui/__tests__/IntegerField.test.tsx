/** Focused coverage for the shared whole-number input helper. Regression
 * guards for two real bugs: half-step quantities ("10 -> 9,5 -> 9 -> 8,5")
 * and a leading-zero bug where typing "30" over an existing "0" produced
 * "03". Uses a small controlled wrapper so tests exercise the same
 * value-in/onChange-out contract every call site uses. */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { IntegerField } from "../IntegerField";

function Controlled({
  initial,
  min = 1,
  max,
  onChangeSpy,
}: {
  initial: number;
  min?: number;
  max?: number;
  onChangeSpy?: (n: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <IntegerField
      value={value}
      onChange={(n) => {
        setValue(n);
        onChangeSpy?.(n);
      }}
      min={min}
      max={max}
      aria-label="Menge"
    />
  );
}

function getInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Menge" }) as HTMLInputElement;
}

describe("IntegerField", () => {
  it("renders as a numeric-mode text field, not a native number spinner", () => {
    render(<Controlled initial={10} />);
    const input = getInput();
    expect(input.type).toBe("text");
    expect(input.getAttribute("inputMode")).toBe("numeric");
  });

  it("steps by exactly 1 via the +/- buttons, never a fraction", () => {
    const spy = vi.fn();
    render(<Controlled initial={10} onChangeSpy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: "Verringern" }));
    expect(spy).toHaveBeenLastCalledWith(9);
    fireEvent.click(screen.getByRole("button", { name: "Verringern" }));
    expect(spy).toHaveBeenLastCalledWith(8);
    fireEvent.click(screen.getByRole("button", { name: "Erhöhen" }));
    expect(spy).toHaveBeenLastCalledWith(9);
    // Never 9.5, 8.5, etc. — every call must be a whole number.
    for (const call of spy.mock.calls) {
      expect(Number.isInteger(call[0])).toBe(true);
    }
  });

  it("the decrease button cannot go below the configured minimum", () => {
    const spy = vi.fn();
    render(<Controlled initial={1} min={1} onChangeSpy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: "Verringern" }));
    expect(spy).toHaveBeenLastCalledWith(1);
  });

  it("rejects decimal input typed directly into the field", () => {
    render(<Controlled initial={10} />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "9.5" } });
    // The "." never makes it through — digits are concatenated instead.
    expect(input.value).not.toContain(".");
    expect(input.value).toBe("95");
  });

  it("typing 30 over an existing 0 produces 30, never 03", () => {
    render(<Controlled initial={0} min={0} />);
    const input = getInput();
    // Simulates the browser inserting after the cursor without a prior
    // select-all — normalizeIntegerText must still collapse the leading 0.
    fireEvent.change(input, { target: { value: "03" } });
    expect(input.value).toBe("3");
    fireEvent.change(input, { target: { value: "30" } });
    expect(input.value).toBe("30");
  });

  it("normalizes leading zeros as the user types: 030 -> 30", () => {
    render(<Controlled initial={0} min={0} />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "030" } });
    expect(input.value).toBe("30");
  });

  it("selects all text on focus so typing replaces the existing value", () => {
    render(<Controlled initial={10} />);
    const input = getInput();
    const selectSpy = vi.spyOn(input, "select");
    fireEvent.focus(input);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it("permits a temporary empty value while editing, without snapping back to the minimum immediately", () => {
    const spy = vi.fn();
    render(<Controlled initial={10} min={1} onChangeSpy={spy} />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    // Not forced back to "1" (or anything else) while still editing.
    expect(spy).not.toHaveBeenCalled();
  });

  it("on blur, normalizes and enforces the minimum for an empty field", () => {
    const spy = vi.fn();
    render(<Controlled initial={10} min={1} onChangeSpy={spy} />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("1");
    expect(spy).toHaveBeenLastCalledWith(1);
  });

  it("on blur, clamps a below-minimum value up to the minimum", () => {
    render(<Controlled initial={10} min={5} />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.blur(input);
    expect(input.value).toBe("5");
  });

  it("does not change value on a wheel event over a focused field", () => {
    const spy = vi.fn();
    render(<Controlled initial={10} onChangeSpy={spy} />);
    const input = getInput();
    input.focus();
    fireEvent.wheel(input, { deltaY: -100 });
    expect(spy).not.toHaveBeenCalled();
    expect(input.value).toBe("10");
  });

  it("syncs the displayed text when the value prop changes externally", () => {
    const { rerender } = render(
      <IntegerField value={10} onChange={vi.fn()} min={1} aria-label="Menge" />
    );
    expect(getInput().value).toBe("10");
    rerender(<IntegerField value={25} onChange={vi.fn()} min={1} aria-label="Menge" />);
    expect(getInput().value).toBe("25");
  });
});
