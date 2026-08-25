import { useState } from "react";
import type { CatalogItem, OfferLine, QuantityMode, WarningSeverity } from "../../types";
import {
  computeOfferLineTotal,
  formatCurrency,
  isPieceUnitBasis,
  lineWarnings,
} from "../../utils/pricing";
import { IntegerField } from "../ui/IntegerField";

function warningLineClasses(severity: WarningSeverity): string {
  if (severity === "blocking") {
    return "rounded-control border border-danger-border bg-danger-soft px-2 py-1.5 text-danger";
  }
  return "rounded-control border border-warning-border bg-warning-soft px-2 py-1.5 text-warning";
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path
        d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .6 9.4a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4L14.5 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

/**
 * Compact editable row (per the approved split-screen mockup): title,
 * quantity stepper and line total always visible; Bezug (quantityMode),
 * unit price, warnings and the composite customization note move behind a
 * details toggle so the default row height stays low enough to show
 * several positions at once. Nothing here is dropped, only collapsed —
 * see CONFIGURATOR_OFFER_SUMMARY_INTEGER_INPUT_FIX_V1 for the "preserve
 * all business logic" requirement this is scoped against. A warning
 * indicator stays visible on the collapsed row so a blocking issue is
 * never silently hidden behind the toggle.
 */
export function OfferLineItem({
  line,
  catalogItem,
  persons,
  onQuantityChange,
  onModeChange,
  onCustomizationNoteChange,
  onRemove,
}: OfferLineItemProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const total = computeOfferLineTotal(line, persons);
  const warnings = catalogItem
    ? lineWarnings(catalogItem, persons, line.quantityMode, line.quantity)
    : [];
  const isComposite =
    catalogItem?.item_kind === "composite" || line.snapshot.item_kind === "composite";
  const detailsId = `line-${line.lineId}-details`;

  return (
    <li className="rounded-control border border-line bg-white">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-ink">{line.snapshot.title}</p>
            {warnings.length && !detailsOpen ? (
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning-soft text-[10px] font-bold text-warning"
                title="Hinweise vorhanden — Details anzeigen"
                aria-hidden="true"
              >
                !
              </span>
            ) : null}
          </div>
          {isComposite ? <p className="text-xs text-muted">Paket</p> : null}
        </div>

        <IntegerField
          value={line.quantity}
          onChange={(q) => onQuantityChange(line.lineId, q)}
          min={1}
          aria-label={`Menge für ${line.snapshot.title}`}
          inputClassName="w-9 rounded-control border border-line bg-white px-1 py-1 text-center text-sm focus:border-accent"
          stepperClassName="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-line bg-white text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
        />

        <span className="w-16 shrink-0 text-right text-sm font-bold text-ink">
          {formatCurrency(total)}
        </span>

        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          aria-label={detailsOpen ? "Details ausblenden" : "Details anzeigen"}
          onClick={() => setDetailsOpen((v) => !v)}
          className="shrink-0 rounded-control p-1 text-muted transition hover:bg-canvas hover:text-ink"
        >
          <ChevronIcon open={detailsOpen} />
        </button>

        {/* Subdued by default so it doesn't compete with the primary
            action elsewhere on the page — but still clearly a destructive
            action once noticed, via the danger-tinted hover state. */}
        <button
          type="button"
          onClick={() => onRemove(line.lineId)}
          aria-label={`${line.snapshot.title} entfernen`}
          className="shrink-0 rounded-control p-1 text-muted transition hover:bg-danger-soft hover:text-danger"
        >
          <TrashIcon />
        </button>
      </div>

      {detailsOpen ? (
        <div id={detailsId} className="space-y-2 border-t border-line px-3 py-2.5">
          <p className="text-xs text-muted">
            {isPieceUnitBasis(line.snapshot.price_type) ? "Preis pro Stück" : "Preis pro Person"} ·{" "}
            {formatCurrency(line.snapshot.chosen_price)}
          </p>
          {line.snapshot.surchargeSelected ? (
            <p className="text-xs font-medium text-ink">
              + {line.snapshot.surchargeLabel} ({formatCurrency(line.snapshot.surchargeAmount ?? 0)}{" "}
              Aufpreis)
            </p>
          ) : null}

          {warnings.length ? (
            <ul className="space-y-1 text-xs">
              {warnings.map((w, i) => (
                <li key={`${w.code}-${i}`} className={warningLineClasses(w.severity)}>
                  {w.message}
                </li>
              ))}
            </ul>
          ) : null}

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[.05em] text-muted">
              Bezug
            </span>
            <select
              value={line.quantityMode}
              onChange={(e) => onModeChange(line.lineId, e.target.value as QuantityMode)}
              className="w-full rounded-control border border-line bg-white px-2 py-1 text-sm focus:border-accent sm:w-48"
            >
              <option value="total">Gesamt</option>
              <option value="per_person">Pro Person</option>
            </select>
          </label>

          {isComposite ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink">Änderungswunsch am Paket</span>
              <textarea
                rows={2}
                value={line.customizationNote ?? ""}
                onChange={(e) => onCustomizationNoteChange(line.lineId, e.target.value)}
                placeholder={"Dessert tauschen:\nSalat entfernen:\nStarter hinzufügen:\nSonstiges:"}
                className="min-h-[4rem] resize-y rounded-control border border-line bg-white px-2 py-1.5 text-sm text-ink focus:border-accent"
              />
              <span className="text-xs leading-relaxed text-muted">
                Änderungen am Paket müssen intern geprüft werden. Preis bleibt vorläufig.
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
