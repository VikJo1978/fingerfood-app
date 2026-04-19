import { formatCurrency } from "../../utils/pricing";

interface BudgetStatusProps {
  enabled: boolean;
  totalBudget: number;
  subtotal: number;
}

export function BudgetStatus({ enabled, totalBudget, subtotal }: BudgetStatusProps) {
  if (!enabled) return null;

  const over = subtotal > totalBudget;
  const diff = Math.abs(subtotal - totalBudget);

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        over
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
      role="status"
    >
      <div className="font-semibold">{over ? "Über Budget" : "Im Budget"}</div>
      <div className="mt-1 text-xs opacity-90">
        {over
          ? `${formatCurrency(diff)} über dem Ziel`
          : totalBudget > 0
            ? `Noch ${formatCurrency(diff)} bis zum Limit`
            : "Budget ist auf 0 gesetzt — bitte prüfen."}
      </div>
    </div>
  );
}
