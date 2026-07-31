import type { BudgetBreakdown } from "../../utils/budgetBreakdown";
import { formatCurrency } from "../../utils/pricing";

interface BudgetStatusProps {
  enabled: boolean;
  breakdown: BudgetBreakdown;
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-180"
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Budget/Aktuell/Verfügbar stat card + always-visible formula line, shown
 * at the top of the Offer pane, plus a collapsed-by-default "So wird
 * gerechnet" disclosure with the full Berücksichtigt/Nicht berücksichtigt
 * breakdown. All figures come from `computeBudgetBreakdown` (which itself
 * only selects/labels existing totals-engine output) — nothing here
 * recomputes pricing. Still fully gated on `enabled` (unchanged business
 * rule) — this only redesigns how it looks, and adds the transparency
 * disclosure, when it *is* shown.
 */
export function BudgetStatus({ enabled, breakdown }: BudgetStatusProps) {
  if (!enabled) return null;

  const { over, remaining, budgetType, comparisonLabel, comparisonAbsolute, comparisonPerPerson } =
    breakdown;

  const headlineCurrent = budgetType === "per_person" ? comparisonPerPerson : comparisonAbsolute;
  const currentLabel =
    budgetType === "per_person" ? `${comparisonLabel} pro Person` : comparisonLabel;
  const availableLabel = budgetType === "per_person" ? "Verfügbar pro Person" : "Verfügbar";
  const pctUsed =
    breakdown.absoluteBudget > 0
      ? Math.round((breakdown.comparisonAbsolute / breakdown.absoluteBudget) * 100)
      : 0;
  const barPct = Math.min(100, Math.max(0, pctUsed));

  return (
    <div className="rounded-control border border-line bg-canvas/60 p-2.5" role="status">
      <p className="text-xs font-semibold text-ink" data-testid="budget-formula">
        {breakdown.formulaText}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.05em] text-muted">Budget</p>
          <p className="text-sm font-bold text-ink">
            {formatCurrency(breakdown.configuredAmount)}
            {budgetType === "per_person" ? " /P" : ""}
          </p>
        </div>
        <div>
          <p className="truncate text-[10px] font-bold uppercase tracking-[.05em] text-muted">
            {currentLabel}
          </p>
          <p className="text-sm font-bold text-ink">{formatCurrency(headlineCurrent)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.05em] text-muted">
            {availableLabel}
          </p>
          <p className={`text-sm font-bold ${over ? "text-danger" : "text-accent-deep"}`}>
            {formatCurrency(remaining)}
          </p>
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width] ${over ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        {over ? "Budget überschritten" : `${pctUsed}% des Budgets verwendet`}
      </p>

      <details className="group mt-2 rounded-control border border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1 text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span>So wird gerechnet</span>
          <ChevronDown />
        </summary>
        <div className="space-y-2 px-2.5 pb-2.5 text-xs">
          <div>
            <p className="font-bold uppercase tracking-[.05em] text-accent-deep">Berücksichtigt</p>
            <ul className="mt-1 space-y-0.5">
              {breakdown.included.map((line) => (
                <li key={line.label} className="flex items-baseline justify-between gap-3 text-ink">
                  <span>{line.label}</span>
                  {line.amount !== undefined ? (
                    <span className="shrink-0 font-semibold">{formatCurrency(line.amount)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          {breakdown.excluded.length ? (
            <div>
              <p className="font-bold uppercase tracking-[.05em] text-muted">Nicht berücksichtigt</p>
              <ul className="mt-1 space-y-0.5 text-muted">
                {breakdown.excluded.map((line) => (
                  <li key={line.label}>{line.label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="border-t border-line pt-1.5 text-ink">
            <div className="flex items-baseline justify-between gap-3 font-semibold">
              <span>{breakdown.comparisonLabel}</span>
              <span>{formatCurrency(breakdown.comparisonAbsolute)}</span>
            </div>
            {budgetType === "per_person" ? (
              <div className="flex items-baseline justify-between gap-3 text-muted">
                <span>{breakdown.comparisonLabel} ÷ {breakdown.persons} Personen</span>
                <span>{formatCurrency(breakdown.comparisonPerPerson)}</span>
              </div>
            ) : null}
            <div
              className={`flex items-baseline justify-between gap-3 font-bold ${over ? "text-danger" : "text-accent-deep"}`}
            >
              <span>{over ? "Überschritten" : "Verfügbar"}{budgetType === "per_person" ? " pro Person" : ""}</span>
              <span>{formatCurrency(Math.abs(remaining))}</span>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
