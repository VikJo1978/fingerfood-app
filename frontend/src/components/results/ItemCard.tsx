import { useEffect, useState } from "react";
import type { CatalogItem, QuantityMode, WarningSeverity } from "../../types";
import { computeLineTotal, formatCurrency, isPieceUnitBasis, lineWarnings } from "../../utils/pricing";
import { TagBadge } from "../ui/TagBadge";
import { ALLERGEN_LABELS_DE } from "../../constants/classification";
import { activeIngredientLabels, dietLabelDe } from "../../utils/classificationDisplay";

interface ItemCardProps {
  item: CatalogItem;
  persons: number;
  onAdd: (item: CatalogItem, mode: QuantityMode, quantity: number, surchargeSelected: boolean) => void;
}

function defaultQuantity(mode: QuantityMode): number {
  return mode === "total" ? 10 : 1;
}

function warningListClasses(severity: WarningSeverity): string {
  if (severity === "blocking") {
    return "rounded-control border border-danger-border bg-danger-soft px-3 py-2 text-danger";
  }
  return "rounded-control border border-warning-border bg-warning-soft px-3 py-2 text-warning";
}

export function ItemCard({ item, persons, onAdd }: ItemCardProps) {
  const [mode, setMode] = useState<QuantityMode>("total");
  const [quantity, setQuantity] = useState(defaultQuantity("total"));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [surchargeSelected, setSurchargeSelected] = useState(false);

  useEffect(() => {
    setQuantity(defaultQuantity(mode));
  }, [mode]);

  const hasSurcharge = item.surcharge_amount != null && !!item.surcharge_label;
  const preview = computeLineTotal(item, persons, mode, quantity, surchargeSelected);
  const warnings = lineWarnings(item, persons, mode, quantity);
  // Label follows unit basis (`price_type`); `pricing_mode` is carried separately on the item.
  const priceLabel = isPieceUnitBasis(item.price_type)
    ? `${formatCurrency(item.price)} / ${item.unit_label}`
    : `${formatCurrency(item.price)} / Person`;

  const ingredientsOn = activeIngredientLabels(item.ingredient_flags);
  const detailsId = `item-${item.id}-details`;
  const itemsIncludedText = item.items_included?.trim() ?? "";

  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-white p-4 shadow-card">
      <div className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-ink">{item.name}</h3>
            {item.item_kind === "composite" ? <TagBadge label="Paket" /> : null}
          </div>
          <span className="shrink-0 rounded-control bg-accent-soft px-2.5 py-1 text-sm font-bold text-accent-deep">
            {priceLabel}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted">{item.description}</p>
        <p className="text-xs text-muted">
          Mindestbestellmenge: {item.min_order} {item.unit_label}
        </p>
      </div>

      {warnings.length ? (
        <p className="text-xs font-bold text-warning">Hinweise vorhanden</p>
      ) : null}

      <div>
        <button
          type="button"
          id={`${detailsId}-toggle`}
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((v) => !v)}
          className="text-sm font-bold text-accent underline-offset-2 hover:underline"
        >
          {detailsOpen ? "Details ausblenden" : "Details anzeigen"}
        </button>
        {detailsOpen ? (
          <div
            id={detailsId}
            role="region"
            aria-labelledby={`${detailsId}-toggle`}
            className="mt-3 space-y-3 border-t border-line pt-3"
          >
            {itemsIncludedText ? (
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-[.05em] text-muted">
                  Enthalten / Zusammensetzung
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                  {itemsIncludedText}
                </p>
              </div>
            ) : null}

            {item.diet_type != null ? (
              <div className="flex flex-wrap items-center gap-2">
                <TagBadge label={dietLabelDe(item.diet_type)} />
              </div>
            ) : null}

            {ingredientsOn.length ? (
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-[.05em] text-muted">Enthält</p>
                <div className="flex flex-wrap gap-1.5">
                  {ingredientsOn.map(({ key, label }) => (
                    <TagBadge key={key} label={label} />
                  ))}
                </div>
              </div>
            ) : null}

            {(item.allergens ?? []).length ? (
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-[.05em] text-muted">
                  {item.allergens_verified ? "Allergene (deklariert)" : "Allergene (Hinweis, ungeprüft)"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(item.allergens ?? []).map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center rounded-full border border-warning-border bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning"
                    >
                      {ALLERGEN_LABELS_DE[code] ?? code}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {!item.allergens_verified ? (
              <p className="text-xs font-medium text-warning">
                ⚠ Allergene nur automatisch aus der Beschreibung abgeleitet, nicht küchenseitig
                geprüft. Vor Zusagen an Kunden mit Allergien bitte in der Küche nachfragen.
              </p>
            ) : null}

            {warnings.length ? (
              <ul className="space-y-1 text-xs">
                {warnings.map((w, i) => (
                  <li key={`${w.code}-${i}`} className={warningListClasses(w.severity)}>
                    {w.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[.05em] text-muted">
            Menge bezieht sich auf
          </span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as QuantityMode)}
            className="rounded-control border border-line bg-white px-3 py-2 text-sm focus:border-accent"
          >
            <option value="total">Gesamt</option>
            <option value="per_person">Pro Person</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[.05em] text-muted">Menge</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="rounded-control border border-line bg-canvas/60 px-3 py-2 text-sm focus:border-accent focus:bg-white"
          />
        </label>
      </div>

      {hasSurcharge ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={surchargeSelected}
            onChange={(e) => setSurchargeSelected(e.target.checked)}
            className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
          />
          {item.surcharge_label} ({formatCurrency(item.surcharge_amount ?? 0)} Aufpreis)
        </label>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <span className="text-muted">Vorschau: </span>
          <span className="font-bold text-ink">{formatCurrency(preview)}</span>
        </div>
        <button
          type="button"
          onClick={() => onAdd(item, mode, quantity, surchargeSelected)}
          className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-5 text-sm font-bold text-white shadow-sm transition hover:bg-accent-deep active:scale-[0.98]"
        >
          Zum Angebot hinzufügen
        </button>
      </div>
    </article>
  );
}
