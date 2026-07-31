import { describe, expect, it } from "vitest";
import { clampInteger, normalizeIntegerText } from "../integerInput";

describe("normalizeIntegerText", () => {
  it("allows a temporary empty string while editing", () => {
    expect(normalizeIntegerText("")).toBe("");
  });

  it("keeps a single zero as-is", () => {
    expect(normalizeIntegerText("0")).toBe("0");
  });

  it("normalizes a leading zero: 03 -> 3", () => {
    expect(normalizeIntegerText("03")).toBe("3");
  });

  it("normalizes multiple leading zeros: 030 -> 30", () => {
    expect(normalizeIntegerText("030")).toBe("30");
  });

  it("leaves an already-clean multi-digit value untouched: 30 -> 30", () => {
    expect(normalizeIntegerText("30")).toBe("30");
  });

  it("drops decimal points instead of allowing fractional entry: 9.5 -> 95", () => {
    expect(normalizeIntegerText("9.5")).toBe("95");
  });

  it("strips any other non-digit characters", () => {
    expect(normalizeIntegerText("1a2b3")).toBe("123");
    expect(normalizeIntegerText("-5")).toBe("5");
  });
});

describe("clampInteger", () => {
  it("rounds fractional values", () => {
    expect(clampInteger(3.7, 1)).toBe(4);
    expect(clampInteger(3.2, 1)).toBe(3);
  });

  it("enforces the minimum", () => {
    expect(clampInteger(0, 1)).toBe(1);
    expect(clampInteger(-5, 1)).toBe(1);
  });

  it("enforces the maximum when given", () => {
    expect(clampInteger(10, 1, 5)).toBe(5);
  });

  it("falls back to min for NaN (e.g. a temporarily empty field on blur)", () => {
    expect(clampInteger(Number.NaN, 1)).toBe(1);
  });
});
