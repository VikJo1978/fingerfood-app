import { describe, expect, it } from "vitest";
import { formatCentsInput, parseGermanMoneyToCents } from "../money";

describe("parseGermanMoneyToCents", () => {
  it.each([
    ["35", 3500],
    ["35,00", 3500],
    ["0,50", 50],
    ["0", 0],
  ])("parses %s as integer cents", (input, cents) => {
    expect(parseGermanMoneyToCents(input)).toEqual({ ok: true, cents });
  });

  it.each(["-1", "1.25", "1,234", "abc", "1,2,3", ""])("rejects %s", (input) => {
    expect(parseGermanMoneyToCents(input).ok).toBe(false);
  });
});

describe("formatCentsInput", () => {
  it("formats cents for German decimal editing", () => {
    expect(formatCentsInput(50)).toBe("0,50");
    expect(formatCentsInput(3500)).toBe("35,00");
  });
});
