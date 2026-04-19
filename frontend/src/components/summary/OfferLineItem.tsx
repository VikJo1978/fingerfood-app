import type { FingerfoodItem, OfferLine, QuantityMode, WarningSeverity } from "../../types";
import { computeOfferLineTotal, formatCurrency, lineWarnings } from "../../utils/pricing";

function warningLineClasses(severity: WarningSeverity): string {
  if (severity === "blocking") {
    return "rounded-lg border border-red-200 bg-red-50/90 px-2 py-1.5 text-red-900";
  }
  return "rounded-lg border border-amber-100 bg-amber-50/80 px-2 py-1.5 text-amber-900";
}

interface OfferLineItemProps {
  line: OfferLine;
  /** Live catalog row when available; warnings use it. Display and line total use snapshot only. */
  catalogItem?: FingerfoodItem;
  persons: number;
  onQuantityChange: (lineId: string, q: number) => void;
  onModeChange: (lineId: string, m: QuantityMode) => void;
  onRemove: (lineId: string) => void;
}

export function OfferLineItem({
  line,
  catalogItem,
  persons,
  onQuantityChange,
  onModeChange,
  onRemove,
}: OfferLineItemProps) {
  const total = computeOfferLineTotal(line, persons);
  const warnings = catalogItem
    ? lineWarnings(catalogItem, persons, line.quantityMode, line.quantity)
    : [];

  return (
    <li className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-slate-900">{line.snapshot.title}</p>
          <p className="text-xs text-slate-500">
            {line.snapshot.price_type === "piece" ? "Preis pro Stück" : "Preis pro Person"} ·{" "}
            {formatCurrency(line.snapshot.chosen_price)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.lineId)}
          className="shrink-0 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Entfernen
        </button>
      </div>

      {warnings.length ? (
        <ul className="mt-3 space-y-1 text-xs">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className={warningLineClasses(w.severity)}>
              {w.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase text-slate-400">Bezug</span>
          <select
            value={line.quantityMode}
            onChange={(e) => onModeChange(line.lineId, e.target.value as QuantityMode)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="total">Gesamt</option>
            <option value="per_person">Pro Person</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase text-slate-400">Menge</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={line.quantity}
            onChange={(e) => onQuantityChange(line.lineId, Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </label>
        <div className="flex flex-col justify-end">
          <span className="text-[11px] font-medium uppercase text-slate-400">Zeilensumme</span>
          <span className="text-sm font-semibold text-slate-900">{formatCurrency(total)}</span>
        </div>
      </div>
    </li>
  );
}
