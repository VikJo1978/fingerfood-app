import type { BudgetBasis, BudgetScope, BudgetType } from "../types";
import {
  computePositionsOnlyGross,
  type PauschalenBreakdown,
  type VatBreakdown,
} from "./pricing";

export interface BudgetComponentLine {
  label: string;
  /** Present for included components; omitted for excluded ones (nothing
   * to show a value for — that's the point of exclusion). */
  amount?: number;
}

export interface BudgetBreakdown {
  budgetType: BudgetType;
  budgetBasis: BudgetBasis;
  budgetScope: BudgetScope;
  /** Raw input, unmodified — `null`/`<= 0` is a real, distinct state, not
   * normalized away. See `personsRequired`. */
  persons: number | null;
  /** The raw configured number — a per-person rate or an absolute total,
   * depending on `budgetType`. */
  configuredAmount: number;
  /** `configuredAmount` expressed as an absolute total (× persons when
   * `budgetType === "per_person"`, unchanged otherwise). `null` exactly
   * when `personsRequired` is true — TOTAL is never affected, since it
   * never multiplies by persons. */
  absoluteBudget: number | null;
  /** The comparison total selected by basis/scope, as an absolute amount
   * — always one of subtotal / pauschalen.grandTotal / vat.totalInclVat /
   * computePositionsOnlyGross(...), never independently recalculated.
   * Always computable — it never depends on `persons`. */
  comparisonAbsolute: number;
  /** `null` exactly when `personsRequired` is true. Mirrors Core's
   * `compute_offer_budget_presentation`, which returns
   * `comparison_amount_cents=None` rather than dividing by an assumed
   * guest count of 1. */
  comparisonPerPerson: number | null;
  /** Label for the comparison total, e.g. "Aktuell (brutto)". */
  comparisonLabel: string;
  /** True exactly when `budgetType === "per_person"` and no valid guest
   * count (missing or `<= 0`) is available — matches Core's
   * `guest_count is None or guest_count <= 0` guard. When true, no
   * Aktuell/Verfügbar/percentage value is fabricated; the UI must show a
   * "Personenzahl erforderlich" state instead, and the operator's chosen
   * amount is never divided by an assumed single guest. TOTAL budgets are
   * entirely unaffected — they never depend on `persons`. */
  personsRequired: boolean;
  /** Remaining budget (positive) or amount exceeded (negative) — per
   * person when budgetType is "per_person", absolute otherwise, so it's
   * always directly comparable to `configuredAmount`. Rounded to the cent
   * (the project's established currency-comparison policy, matching
   * pricing.ts) before `over` is decided, so an operator-visible exact
   * match (e.g. "0,00 €" available) is never reported as exceeded (or vice
   * versa) purely from sub-cent floating-point residue. `null` exactly
   * when `personsRequired` is true. */
  remaining: number | null;
  over: boolean | null;
  included: BudgetComponentLine[];
  excluded: BudgetComponentLine[];
  /** Concise always-visible formula text, e.g.
   * "35,00 € × 30 Personen = 1.050,00 €" (per_person) or "1.200,00 €"
   * (total). A German "guest count required" sentence when
   * `personsRequired` is true. */
  formulaText: string;
  /** Progress-bar percentage (0–100, already clamped) — precomputed here
   * so the component only renders it, never recomputes it. `null` exactly
   * when `personsRequired` is true (no misleading percentage). */
  pctUsed: number | null;
  barPct: number;
}

/** The project's established currency-comparison policy (matches
 * pricing.ts): round to the nearest cent before comparing signs, so
 * "over budget" is decided on the same precision the operator sees
 * displayed, never on invisible sub-cent floating-point residue.
 * `+ 0` normalizes a `-0` result (e.g. rounding -0.003) to plain `0` —
 * Intl.NumberFormat renders `-0` as "-0,00 €", a real display bug for an
 * exact-match budget otherwise. */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

interface ComputeBudgetBreakdownInput {
  budgetType: BudgetType;
  budgetBasis: BudgetBasis;
  budgetScope: BudgetScope;
  configuredAmount: number;
  /** `null` and `<= 0` are both treated as "no valid guest count" for
   * `budgetType === "per_person"` — mirrors Core's `guest_count: int |
   * None` plus its `guest_count <= 0` defensive guard. Irrelevant for
   * `budgetType === "total"`, which never divides by persons. */
  persons: number | null;
  subtotal: number;
  pauschalen: PauschalenBreakdown;
  vat: VatBreakdown;
  formatCurrency: (n: number) => string;
}

export const PERSONS_REQUIRED_TEXT = "Personenzahl erforderlich";

const POSITIONEN_LABEL = "Positionen (Speisen etc.) netto";
const PAUSCHALEN_LABEL = "Pauschalen (Büffet, Geschirr, Anlieferung)";
const MWST_LABEL = "MwSt.";
const POSITIONEN_BRUTTO_LABEL = "Positionen (Speisen etc.) inkl. MwSt.";

/**
 * Composes the budget transparency breakdown entirely from values already
 * produced by the totals engine (utils/pricing.ts) — `subtotal`,
 * `pauschalen.*`, `vat.*`, and `computePositionsOnlyGross`. No pricing/VAT
 * math is re-derived here; this only *selects and labels* existing
 * numbers according to the operator's chosen budget type/basis/scope.
 */
export function computeBudgetBreakdown({
  budgetType,
  budgetBasis,
  budgetScope,
  configuredAmount,
  persons,
  subtotal,
  pauschalen,
  vat,
  formatCurrency,
}: ComputeBudgetBreakdownInput): BudgetBreakdown {
  const personsRequired = budgetType === "per_person" && !(typeof persons === "number" && persons > 0);

  const absoluteBudget =
    budgetType === "per_person"
      ? personsRequired
        ? null
        : configuredAmount * (persons as number)
      : configuredAmount;

  let comparisonAbsolute: number;
  let comparisonLabel: string;
  const included: BudgetComponentLine[] = [];
  const excluded: BudgetComponentLine[] = [];

  if (budgetScope === "full_offer") {
    included.push({ label: POSITIONEN_LABEL, amount: subtotal });
    included.push({
      label: PAUSCHALEN_LABEL,
      amount:
        pauschalen.buffetpauschale + pauschalen.geschirrpauschale + pauschalen.anlieferung,
    });
    if (budgetBasis === "gross") {
      included.push({ label: MWST_LABEL, amount: vat.vat7Amount + vat.vat19Amount });
      comparisonAbsolute = vat.totalInclVat;
      comparisonLabel = "Aktuell (brutto)";
    } else {
      excluded.push({ label: MWST_LABEL });
      comparisonAbsolute = pauschalen.grandTotal;
      comparisonLabel = "Aktuell (netto, inkl. Pauschalen)";
    }
  } else {
    excluded.push({ label: PAUSCHALEN_LABEL });
    excluded.push({ label: "Anlieferung" });
    if (budgetBasis === "gross") {
      const positionsGross = computePositionsOnlyGross(subtotal, vat, pauschalen);
      included.push({ label: POSITIONEN_BRUTTO_LABEL, amount: positionsGross });
      comparisonAbsolute = positionsGross;
      comparisonLabel = "Speisen (brutto)";
    } else {
      included.push({ label: POSITIONEN_LABEL, amount: subtotal });
      excluded.push({ label: MWST_LABEL });
      comparisonAbsolute = subtotal;
      comparisonLabel = "Speisen (netto)";
    }
  }

  const comparisonPerPerson = personsRequired ? null : comparisonAbsolute / (persons as number);
  const remaining = personsRequired
    ? null
    : roundCents(
        budgetType === "per_person"
          ? configuredAmount - (comparisonPerPerson as number)
          : (absoluteBudget as number) - comparisonAbsolute
      );
  const over = remaining === null ? null : remaining < 0;

  const formulaText = personsRequired
    ? `${formatCurrency(configuredAmount)} / Person — ${PERSONS_REQUIRED_TEXT}`
    : budgetType === "per_person"
      ? `${formatCurrency(configuredAmount)} × ${persons} Personen = ${formatCurrency(absoluteBudget as number)}`
      : formatCurrency(absoluteBudget as number);

  const pctUsed = personsRequired
    ? null
    : absoluteBudget !== null && absoluteBudget > 0
      ? Math.round((comparisonAbsolute / absoluteBudget) * 100)
      : 0;
  const barPct = pctUsed === null ? 0 : Math.min(100, Math.max(0, pctUsed));

  return {
    budgetType,
    budgetBasis,
    budgetScope,
    persons,
    configuredAmount,
    absoluteBudget,
    comparisonAbsolute,
    comparisonPerPerson,
    comparisonLabel,
    personsRequired,
    remaining,
    over,
    included,
    excluded,
    formulaText,
    pctUsed,
    barPct,
  };
}
