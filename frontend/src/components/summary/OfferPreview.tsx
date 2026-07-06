import type { CatalogItem, OfferDraft, OfferLine } from "../../types";
import {
  computeOfferLineTotal,
  formatCurrency,
  isPieceUnitBasis,
  type PauschalenBreakdown,
} from "../../utils/pricing";

function dashIfEmpty(v: string | undefined): string {
  const t = v?.trim();
  return t ? t : "—";
}

function quantityModeLabel(mode: OfferLine["quantityMode"]): string {
  return mode === "total" ? "Gesamt" : "Pro Person";
}

function isCompositeLine(line: OfferLine, catalogItem?: CatalogItem): boolean {
  return catalogItem?.item_kind === "composite" || line.snapshot.item_kind === "composite";
}

export interface OfferPreviewProps {
  open: boolean;
  onClose: () => void;
  draft: OfferDraft;
  itemsById: Record<string, CatalogItem>;
  subtotal: number;
  pricePerPerson: number;
  pauschalen: PauschalenBreakdown;
}

export function OfferPreview({
  open,
  onClose,
  draft,
  itemsById,
  subtotal,
  pricePerPerson,
  pauschalen,
}: OfferPreviewProps) {
  if (!open) return null;

  const oc = draft.orderContext;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Angebotsvorschau"
      onClick={onClose}
    >
      <div
        data-print-root
        className="max-h-[min(90vh,48rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xl print:max-h-none print:w-auto print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm print:static print:border-0">
          <h2 className="text-base font-semibold text-slate-900">Angebotsvorschau</h2>
          <div className="flex shrink-0 gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Drucken / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Schließen
            </button>
          </div>
        </div>

        <div className="space-y-6 p-5 pb-6 text-sm text-slate-800">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Basisdaten
            </h3>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Firma</dt>
                <dd className="font-medium text-slate-900">{dashIfEmpty(oc.companyName)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Ansprechpartner</dt>
                <dd className="font-medium text-slate-900">{dashIfEmpty(oc.contactPerson)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Datum</dt>
                <dd className="font-medium text-slate-900">{dashIfEmpty(oc.eventDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Uhrzeit</dt>
                <dd className="font-medium text-slate-900">{dashIfEmpty(oc.eventTime)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Ort</dt>
                <dd className="font-medium text-slate-900">{dashIfEmpty(oc.location)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Personen</dt>
                <dd className="font-medium text-slate-900">{draft.persons}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Positionen
            </h3>
            {draft.lines.length === 0 ? (
              <p className="mt-3 text-slate-500">Keine Positionen im Entwurf.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {draft.lines.map((line) => {
                  const it = itemsById[line.itemId];
                  const name = it?.name ?? line.snapshot.title;
                  const lineTotal = computeOfferLineTotal(line, draft.persons);
                  const unitBasis = isPieceUnitBasis(line.snapshot.price_type)
                    ? "Preis pro Stück"
                    : "Preis pro Person";
                  const composite = isCompositeLine(line, it);
                  const itemsIncluded = it?.items_included?.trim();
                  const note = line.customizationNote?.trim();

                  return (
                    <li
                      key={line.lineId}
                      className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4"
                    >
                      <p className="font-semibold text-slate-900">{name}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Menge: {line.quantity} · Bezug: {quantityModeLabel(line.quantityMode)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {unitBasis}: {formatCurrency(line.snapshot.chosen_price)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        Zeilensumme: {formatCurrency(lineTotal)}
                      </p>
                      {composite && itemsIncluded ? (
                        <div className="mt-3 border-t border-slate-200/80 pt-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Zusammensetzung
                          </p>
                          <pre className="mt-1.5 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">
                            {itemsIncluded}
                          </pre>
                        </div>
                      ) : null}
                      {composite && note ? (
                        <div className="mt-3 border-t border-slate-200/80 pt-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Änderungswunsch
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {note}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Summen
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Positionen</span>
                <span className="font-semibold text-slate-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-slate-600">Preis pro Person (Positionen)</span>
                <span className="font-semibold text-slate-800">{formatCurrency(pricePerPerson)}</span>
              </div>
              <div className="flex justify-between gap-4 text-xs text-slate-500">
                <span>Büffetpauschale</span>
                <span>{formatCurrency(pauschalen.buffetpauschale)}</span>
              </div>
              <div className="flex justify-between gap-4 text-xs text-slate-500">
                <span>Geschirrpauschale</span>
                <span>{formatCurrency(pauschalen.geschirrpauschale)}</span>
              </div>
              <div className="flex justify-between gap-4 text-xs text-slate-500">
                <span>Anlieferung (Standardzone)</span>
                <span>{formatCurrency(pauschalen.anlieferung)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-100 pt-2">
                <span className="font-medium text-slate-700">Gesamtsumme inkl. Pauschalen</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(pauschalen.grandTotal)}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-950">
            <h3 className="font-semibold text-amber-900">Hinweise</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>Änderungen am Paket müssen intern geprüft werden.</li>
              <li>Preis bleibt vorläufig.</li>
              <li>
                Büffetpauschale, Anlieferung (Standardzone: Innenstadt Hamburg, barrierefrei, ohne
                Treppen, direkt anfahrbar) und Geschirrpauschale sind unten enthalten; MwSt. wird
                nicht automatisch kalkuliert.
              </li>
              <li className="font-semibold">
                ⚠ Allergenangaben sind, sofern nicht anders vermerkt, automatisch aus den
                Beschreibungen abgeleitet und küchenseitig ungeprüft — bei Kundenanfragen zu
                Allergien bitte vor Zusage in der Küche nachfragen.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
