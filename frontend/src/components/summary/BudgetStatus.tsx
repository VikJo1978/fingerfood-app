import { formatCurrency } from "../../utils/pricing";

interface BudgetStatusProps {
  enabled: boolean;
  totalBudget: number;
  /** Final total incl. Pauschalen and VAT — matches "Aktuell (brutto)" in
   * the approved split-screen mockup. Only the *displayed* comparison
   * changed from the Positionen-only subtotal to this; the underlying
   * Pauschalen/VAT math is untouched (see OfferSummary/utils/pricing). */
  currentTotal: number;
}

/** Budget/current/remaining stat row + progress bar, shown at the top of
 * the Offer pane. Still fully gated on `enabled` (business rule
 * unchanged) — this only redesigns how it looks when it *is* shown. */
export function BudgetStatus({ enabled, totalBudget, currentTotal }: BudgetStatusProps) {
  if (!enabled) return null;

  const remaining = totalBudget - currentTotal;
  const over = remaining < 0;
  const pctUsed = totalBudget > 0 ? Math.round((currentTotal / totalBudget) * 100) : 0;
  const barPct = Math.min(100, Math.max(0, pctUsed));

  return (
    <div className="rounded-control border border-line bg-canvas/60 p-2.5" role="status">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.05em] text-muted">Budget</p>
          <p className="text-sm font-bold text-ink">{formatCurrency(totalBudget)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.05em] text-muted">
            Aktuell (brutto)
          </p>
          <p className="text-sm font-bold text-ink">{formatCurrency(currentTotal)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.05em] text-muted">Verfügbar</p>
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
    </div>
  );
}
