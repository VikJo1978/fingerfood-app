import type { CatalogItem, OfferLine, QuantityMode, WarningSeverity } from "../../types";
import { computeOfferLineTotal, formatCurrency, isPieceUnitBasis, lineWarnings } from "../../utils/pricing";
import { IntegerField } from "../ui/IntegerField";

function warningLineClasses(severity: WarningSeverity): string {
  if (severity === "blocking") {
    return "rounded-control border border-danger-border bg-danger-soft px-2 py-1.5 text-danger";
  }
  return "rounded-control border border-warning-border bg-warning-soft px-2 py-1.5 text-warning";
}

interface OfferLineItemProps {
  line: OfferLine;
  /** Live catalog row when available; warnings use it. Display and line total use snapshot only. */
  catalogItem?: CatalogItem;
  persons: number;
  onQuantityChange: (lineId: string, q: number) => void;
  onModeChange: (lineId: string, m: QuantityMode) => void;
  onCustomizationNoteChange: (lineId: string, note: string) => void;
  onRemove: (lineId: string) => void;
}

export function OfferLineItem({
  line,
  catalogItem,
  persons,
  onQuantityChange,
  onModeChange,
  onCustomizationNoteChange,
  onRemove,
}: OfferLineItemProps) {
  const total = computeOfferLineTotal(line, persons);
  const warnings = catalogItem
    ? lineWarnings(catalogItem, persons, line.quantityMode, line.quantity)
    : [];
  const isComposite =
    catalogItem?.item_kind === "composite" || line.snapshot.item_kind === "composite";

  return (
    <li className="rounded-control border border-line bg-canvas/60 p-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-ink">{line.snapshot.title}</p>
            {isComposite ? (
              <span className="inline-flex items-center rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                Paket
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            {isPieceUnitBasis(line.snapshot.price_type) ? "Preis pro Stück" : "Preis pro Person"} ·{" "}
            {formatCurrency(line.snapshot.chosen_price)}
          </p>
          {line.snapshot.surchargeSelected ? (
            <p className="text-xs font-medium text-ink">
              + {line.snapshot.surchargeLabel} ({formatCurrency(line.snapshot.surchargeAmount ?? 0)} Aufpreis)
            </p>
          ) : null}
        </div>
        {/* Subdued by default (a plain outline button, not red) so it
            doesn't compete with the primary action elsewhere on the page —
            but still clearly a destructive action once noticed, via the
            danger-tinted hover state. */}
        <button
          type="button"
          onClick={() => onRemove(line.lineId)}
          aria-label={`${line.snapshot.title} entfernen`}
          className="shrink-0 self-start rounded-control border border-line bg-white px-2.5 py-1 text-xs font-medium text-muted transition hover:border-danger-border hover:bg-danger-soft hover:text-danger"
        >
          Entfernen
        </button>
      </div>

      {warnings.length ? (
        <ul className="mt-2 space-y-1 text-xs">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${i}`} className={warningLineClasses(w.severity)}>
              {w.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-1.5 grid gap-2 xl:grid-cols-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[.05em] text-muted">Bezug</span>
          <select
            value={line.quantityMode}
            onChange={(e) => onModeChange(line.lineId, e.target.value as QuantityMode)}
            className="rounded-control border border-line bg-white px-2 py-1 text-sm focus:border-accent"
          >
            <option value="total">Gesamt</option>
            <option value="per_person">Pro Person</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[.05em] text-muted">Menge</span>
          <IntegerField
            value={line.quantity}
            onChange={(q) => onQuantityChange(line.lineId, q)}
            min={1}
            aria-label={`Menge für ${line.snapshot.title}`}
            inputClassName="w-full min-w-[3rem] rounded-control border border-line bg-white px-2 py-1 text-sm focus:border-accent"
            stepperClassName="flex w-7 items-center justify-center rounded-control border border-line bg-white text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
          />
        </label>
        <div className="flex flex-col justify-end">
          <span className="text-[11px] font-bold uppercase tracking-[.05em] text-muted">
            Zeilensumme
          </span>
          <span className="text-sm font-bold text-ink">{formatCurrency(total)}</span>
        </div>
      </div>

      {isComposite ? (
        <label className="mt-2 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink">Änderungswunsch am Paket</span>
          <textarea
            rows={2}
            value={line.customizationNote ?? ""}
            onChange={(e) => onCustomizationNoteChange(line.lineId, e.target.value)}
            placeholder={
              "Dessert tauschen:\nSalat entfernen:\nStarter hinzufügen:\nSonstiges:"
            }
            className="min-h-[4rem] resize-y rounded-control border border-line bg-white px-2 py-1.5 text-sm text-ink focus:border-accent"
          />
          <span className="text-xs leading-relaxed text-muted">
            Änderungen am Paket müssen intern geprüft werden. Preis bleibt vorläufig.
          </span>
        </label>
      ) : null}
    </li>
  );
}
