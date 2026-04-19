interface TopControlsProps {
  persons: number;
  onPersonsChange: (n: number) => void;
  budgetEnabled: boolean;
  onBudgetEnabledChange: (v: boolean) => void;
  totalBudget: number;
  onTotalBudgetChange: (n: number) => void;
}

export function TopControls({
  persons,
  onPersonsChange,
  budgetEnabled,
  onBudgetEnabledChange,
  totalBudget,
  onTotalBudgetChange,
}: TopControlsProps) {
  const perPersonBudget = persons > 0 ? totalBudget / persons : 0;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Anzahl Personen
        </span>
        <input
          type="number"
          min={1}
          max={5000}
          value={persons}
          onChange={(e) => onPersonsChange(Number(e.target.value))}
          className="w-full min-w-[8rem] rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-slate-900 outline-none ring-accent/30 transition focus:border-accent focus:bg-white focus:ring-2 sm:w-36"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Budget
        </span>
        <button
          type="button"
          onClick={() => onBudgetEnabledChange(!budgetEnabled)}
          className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
            budgetEnabled
              ? "border-accent bg-accent-soft text-accent"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          }`}
          aria-pressed={budgetEnabled}
        >
          <span
            className={`relative inline-flex h-5 w-9 rounded-full transition ${
              budgetEnabled ? "bg-accent" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                budgetEnabled ? "left-4" : "left-0.5"
              }`}
            />
          </span>
          Mit Budget arbeiten
        </button>
      </div>

      {budgetEnabled ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Gesamtbudget
            </span>
            <input
              type="number"
              min={0}
              step={10}
              value={totalBudget}
              onChange={(e) => onTotalBudgetChange(Number(e.target.value))}
              className="w-full min-w-[10rem] rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-slate-900 outline-none ring-accent/30 transition focus:border-accent focus:bg-white focus:ring-2 sm:w-44"
            />
          </label>
          <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 sm:min-w-[12rem]">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Budget pro Person
            </span>
            <span className="text-lg font-semibold text-slate-800">
              {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
                perPersonBudget
              )}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
