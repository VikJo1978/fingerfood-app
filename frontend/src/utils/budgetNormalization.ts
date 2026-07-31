import type { BudgetBasis, BudgetScope, BudgetType } from "../types";

export interface BudgetDefinitionTriple {
  budgetType: BudgetType;
  budgetBasis: BudgetBasis;
  budgetScope: BudgetScope;
}

const BUDGET_TYPES: readonly BudgetType[] = ["per_person", "total"];
const BUDGET_BASES: readonly BudgetBasis[] = ["net", "gross"];
const BUDGET_SCOPES: readonly BudgetScope[] = ["full_offer", "positions_only"];

/** Production's historical, pre-selector semantics: one absolute
 * Gesamtbudget compared against selected Positionen netto only —
 * Pauschalen and VAT excluded. This is what any object that predates the
 * budget-basis selectors meant, and must keep meaning after restore. */
export const LEGACY_BUDGET_DEFINITION: BudgetDefinitionTriple = {
  budgetType: "total",
  budgetBasis: "net",
  budgetScope: "positions_only",
};

/** What a genuinely new configuration defaults to (createInitialOfferDraft). */
export const NEW_BUDGET_DEFINITION: BudgetDefinitionTriple = {
  budgetType: "total",
  budgetBasis: "gross",
  budgetScope: "full_offer",
};

/**
 * The one explicit place that decides what budgetType/budgetBasis/
 * budgetScope mean for an object arriving from OUTSIDE the current
 * in-memory draft — a restored sessionStorage draft, a restored Core
 * handoff, or (once built) a restored saved draft. Never called for a
 * genuinely new draft; createInitialOfferDraft() already hardcodes
 * NEW_BUDGET_DEFINITION directly.
 *
 * Rule: if all three fields are present and each is one of the current
 * valid enum values, they're kept exactly as given (a draft already using
 * the selectors). Otherwise — missing, partial, or holding any value this
 * app no longer/never recognizes — the object is treated as predating the
 * selectors and gets LEGACY_BUDGET_DEFINITION, never a silent `undefined`
 * and never reliance on an HTML <select>'s own fallback-to-first-option
 * behavior.
 */
export function normalizeBudgetDefinition(
  raw: Partial<Record<"budgetType" | "budgetBasis" | "budgetScope", unknown>> | null | undefined
): BudgetDefinitionTriple {
  if (!raw) return { ...LEGACY_BUDGET_DEFINITION };
  const budgetType = raw.budgetType;
  const budgetBasis = raw.budgetBasis;
  const budgetScope = raw.budgetScope;
  if (
    typeof budgetType === "string" &&
    typeof budgetBasis === "string" &&
    typeof budgetScope === "string" &&
    (BUDGET_TYPES as readonly string[]).includes(budgetType) &&
    (BUDGET_BASES as readonly string[]).includes(budgetBasis) &&
    (BUDGET_SCOPES as readonly string[]).includes(budgetScope)
  ) {
    return {
      budgetType: budgetType as BudgetType,
      budgetBasis: budgetBasis as BudgetBasis,
      budgetScope: budgetScope as BudgetScope,
    };
  }
  return { ...LEGACY_BUDGET_DEFINITION };
}
