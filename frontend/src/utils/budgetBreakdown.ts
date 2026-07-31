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
  persons: number;
  /** The raw configured number — a per-person rate or an absolute total,
   * depending on `budgetType`. */
  configuredAmount: number;
  /** `configuredAmount` expressed as an absolute total (× persons when
   * `budgetType === "per_person"`, unchanged otherwise). */
  absoluteBudget: number;
  /** The comparison total selected by basis/scope, as an absolute amount
   * — always one of subtotal / pauschalen.grandTotal / vat.totalInclVat /
   * computePositionsOnlyGross(...), never independently recalculated. */
  comparisonAbsolute: number;
  comparisonPerPerson: number;
  /** Label for the comparison total, e.g. "Aktuell (brutto)". */
  comparisonLabel: string;
  /** Remaining budget (positive) or amount exceeded (negative) — per
   * person when budgetType is "per_person", absolute otherwise, so it's
   * always directly comparable to `configuredAmount`. */
  remaining: number;
  over: boolean;
  included: BudgetComponentLine[];
  excluded: BudgetComponentLine[];
  /** Concise always-visible formula text, e.g.
   * "35,00 € × 30 Personen = 1.050,00 €" (per_person) or "1.200,00 €" (total). */
  formulaText: string;
}

interface ComputeBudgetBreakdownInput {
  budgetType: BudgetType;
  budgetBasis: BudgetBasis;
  budgetScope: BudgetScope;
  configuredAmount: number;
  persons: number;
  subtotal: number;
  pauschalen: PauschalenBreakdown;
  vat: VatBreakdown;
  formatCurrency: (n: number) => string;
}

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
  const safePersons = persons > 0 ? persons : 1;

  const absoluteBudget =
    budgetType === "per_person" ? configuredAmount * safePersons : configuredAmount;

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

  const comparisonPerPerson = comparisonAbsolute / safePersons;
  const remaining =
    budgetType === "per_person"
      ? configuredAmount - comparisonPerPerson
      : absoluteBudget - comparisonAbsolute;
  const over = remaining < 0;

  const formulaText =
    budgetType === "per_person"
      ? `${formatCurrency(configuredAmount)} × ${safePersons} Personen = ${formatCurrency(absoluteBudget)}`
      : formatCurrency(absoluteBudget);

  return {
    budgetType,
    budgetBasis,
    budgetScope,
    persons: safePersons,
    configuredAmount,
    absoluteBudget,
    comparisonAbsolute,
    comparisonPerPerson,
    comparisonLabel,
    remaining,
    over,
    included,
    excluded,
    formulaText,
  };
}
