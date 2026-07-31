import { describe, expect, it } from "vitest";
import {
  LEGACY_BUDGET_DEFINITION,
  NEW_BUDGET_DEFINITION,
  normalizeBudgetDefinition,
} from "../budgetNormalization";

describe("normalizeBudgetDefinition", () => {
  it("returns the legacy TOTAL/NET/POSITIONS_ONLY meaning for null/undefined input", () => {
    expect(normalizeBudgetDefinition(null)).toEqual(LEGACY_BUDGET_DEFINITION);
    expect(normalizeBudgetDefinition(undefined)).toEqual(LEGACY_BUDGET_DEFINITION);
  });

  it("returns the legacy meaning when all three basis fields are missing (amount-only legacy object)", () => {
    const result = normalizeBudgetDefinition({});
    expect(result).toEqual({
      budgetType: "total",
      budgetBasis: "net",
      budgetScope: "positions_only",
    });
  });

  it("keeps a fully-populated, already-valid triple exactly as given", () => {
    const result = normalizeBudgetDefinition({
      budgetType: "per_person",
      budgetBasis: "gross",
      budgetScope: "positions_only",
    });
    expect(result).toEqual({
      budgetType: "per_person",
      budgetBasis: "gross",
      budgetScope: "positions_only",
    });
  });

  it("falls back to legacy when only some fields are present (partial)", () => {
    const result = normalizeBudgetDefinition({
      budgetType: "per_person",
      // budgetBasis and budgetScope missing
    });
    expect(result).toEqual(LEGACY_BUDGET_DEFINITION);
  });

  it("falls back to legacy when a field holds an unrecognized value", () => {
    const result = normalizeBudgetDefinition({
      budgetType: "per_person",
      budgetBasis: "brutto", // not a valid internal enum value
      budgetScope: "full_offer",
    });
    expect(result).toEqual(LEGACY_BUDGET_DEFINITION);
  });

  it("falls back to legacy when a field is the wrong type", () => {
    const result = normalizeBudgetDefinition({
      budgetType: 1,
      budgetBasis: "gross",
      budgetScope: "full_offer",
    } as never);
    expect(result).toEqual(LEGACY_BUDGET_DEFINITION);
  });

  it("NEW_BUDGET_DEFINITION matches createInitialOfferDraft's own defaults", () => {
    expect(NEW_BUDGET_DEFINITION).toEqual({
      budgetType: "total",
      budgetBasis: "gross",
      budgetScope: "full_offer",
    });
  });
});
