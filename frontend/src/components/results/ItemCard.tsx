import { useEffect, useState } from "react";
import type { CatalogItem, QuantityMode, WarningSeverity } from "../../types";
import { computeLineTotal, formatCurrency, isPieceUnitBasis, lineWarnings } from "../../utils/pricing";
import { TagBadge } from "../ui/TagBadge";
import { ALLERGEN_LABELS_DE } from "../../constants/classification";
import { activeIngredientLabels, dietLabelDe } from "../../utils/classificationDisplay";

interface ItemCardProps {
  item: CatalogItem;
  persons: number;
  onAdd: (item: CatalogItem, mode: QuantityMode, quantity: number) => void;
}

function defaultQuantity(mode: QuantityMode): number {
  return mode === "total" ? 10 : 1;
}

function warningListClasses(severity: WarningSeverity): string {
  if (severity === "blocking") {
    return "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900";
  }
  return "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900";
}

export function ItemCard({ item, persons, onAdd }: ItemCardProps) {
  const [mode, setMode] = useState<QuantityMode>("total");
  const [quantity, setQuantity] = useState(defaultQuantity("total"));

  useEffect(() => {
    setQuantity(defaultQuantity(mode));
  }, [mode]);

  const preview = computeLineTotal(item, persons, mode, quantity);
  const warnings = lineWarnings(item, persons, mode, quantity);
  // Label follows unit basis (`price_type`); `pricing_mode` is carried separately on the item.
  const priceLabel = isPieceUnitBasis(item.price_type)
    ? `${formatCurrency(item.price)} / ${item.unit_label}`
    : `${formatCurrency(item.price)} / Person`;

  const ingredientsOn = activeIngredientLabels(item.ingredient_flags);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      <div className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
          <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700">
            {priceLabel}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{item.description}</p>
        <p className="text-xs text-slate-500">
          Mindestbestellmenge: {item.min_order} {item.unit_label}
        </p>
      </div>

      {item.diet_type != null ? (
        <div className="flex flex-wrap items-center gap-2">
          <TagBadge label={dietLabelDe(item.diet_type)} />
        </div>
      ) : null}

      {ingredientsOn.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Enthält</p>
          <div className="flex flex-wrap gap-1.5">
            {ingredientsOn.map(({ key, label }) => (
              <TagBadge key={key} label={label} />
            ))}
          </div>
        </div>
      ) : null}

      {(item.allergens ?? []).length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Allergene (deklariert)</p>
          <div className="flex flex-wrap gap-1.5">
            {(item.allergens ?? []).map((code) => (
              <span
                key={code}
                className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-0.5 text-xs font-medium text-amber-950"
              >
                {ALLERGEN_LABELS_DE[code] ?? code}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Keine Allergene nach Stammdaten deklariert.</p>
      )}

      {warnings.length ? (
        <ul className="space-y-1 text-xs">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className={warningListClasses(w.severity)}>
              {w.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">Menge bezieht sich auf</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as QuantityMode)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-accent/30 focus:border-accent focus:ring-2"
          >
            <option value="total">Gesamt</option>
            <option value="per_person">Pro Person</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">Menge</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm outline-none ring-accent/30 focus:border-accent focus:bg-white focus:ring-2"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <span className="text-slate-500">Vorschau: </span>
          <span className="font-semibold text-slate-900">{formatCurrency(preview)}</span>
        </div>
        <button
          type="button"
          onClick={() => onAdd(item, mode, quantity)}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
        >
          Zum Angebot hinzufügen
        </button>
      </div>
    </article>
  );
}
