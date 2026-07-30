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
    <div className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 shadow-card sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          Anzahl Personen
        </span>
        <input
          type="number"
          min={1}
          max={5000}
          value={persons}
          onChange={(e) => onPersonsChange(Number(e.target.value))}
          className="w-full min-w-[8rem] rounded-control border border-line bg-canvas/60 px-3 py-2.5 text-ink transition focus:border-accent focus:bg-white sm:w-36"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          Budget
        </span>
        <button
          type="button"
          onClick={() => onBudgetEnabledChange(!budgetEnabled)}
          className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
            budgetEnabled
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-white text-ink hover:border-accent hover:bg-accent-soft"
          }`}
          aria-pressed={budgetEnabled}
        >
          <span
            className={`relative inline-flex h-5 w-9 rounded-full transition ${
              budgetEnabled ? "bg-accent" : "bg-line"
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
            <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
              Gesamtbudget
            </span>
            <input
              type="number"
              min={0}
              step={10}
              value={totalBudget}
              onChange={(e) => onTotalBudgetChange(Number(e.target.value))}
              className="w-full min-w-[10rem] rounded-control border border-line bg-canvas/60 px-3 py-2.5 text-ink transition focus:border-accent focus:bg-white sm:w-44"
            />
          </label>
          <div className="flex flex-col gap-1 rounded-control border border-line bg-canvas px-4 py-3 sm:min-w-[12rem]">
            <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
              Budget pro Person
            </span>
            <span className="text-lg font-bold text-ink">
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
