import type { CatalogItem, OfferDraft, OfferLine } from "../../types";
import {
  computeOfferLineTotal,
  formatCurrency,
  isPieceUnitBasis,
  type PauschalenBreakdown,
  type VatBreakdown,
} from "../../utils/pricing";
import logo from "../../assets/silberloeffel-logo.jpg";

function dashIfEmpty(v: string | undefined): string {
  const t = v?.trim();
  return t ? t : "—";
}

/** "YYYY-MM-DD" (native date input) -> "DD.MM.YYYY" (real Angebote's format). */
function formatDateDe(iso: string | undefined): string {
  const t = iso?.trim();
  if (!t) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return t;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function todayDe(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
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
  vat: VatBreakdown;
}

export function OfferPreview({
  open,
  onClose,
  draft,
  itemsById,
  subtotal,
  pricePerPerson,
  pauschalen,
  vat,
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
        className="max-h-[min(90vh,52rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xl print:max-h-none print:w-auto print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm print:hidden">
          <h2 className="text-base font-semibold text-slate-900">Angebotsvorschau</h2>
          <div className="flex shrink-0 gap-2">
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

        {/* Business-letter layout, modeled on real Silberlöffel Angebot/Auftragsbestätigung
            paperwork: letterhead, client block, itemized table, Kalkulation line,
            signature line, legal footer. */}
        <div className="space-y-6 p-6 pb-8 text-sm text-slate-900 sm:p-8">
          {oc.billingAddress?.trim() ? (
            <section className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 print:border-black">
              <p className="text-sm font-bold text-amber-900">
                ⚠ Achtung: abweichender Lieferort — Rechnungsadresse ≠ Lieferadresse!
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Lieferung/Anlieferung an <strong>{oc.location}</strong>. Rechnungsadresse (unten,
                separat) ist NICHT der Lieferort.
              </p>
            </section>
          ) : null}

          {/* Letterhead */}
          <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Angebot / Auftragsbestätigung
              </p>
              <p className="text-xs text-slate-500">Hamburg, {todayDe()}</p>
            </div>
            <img src={logo} alt="Silberlöffel Event Catering Service" className="h-16 w-auto" />
          </header>

          {/* Client block */}
          <section className="grid gap-1 text-sm">
            <p className="font-semibold text-slate-900">{dashIfEmpty(oc.companyName)}</p>
            <p className="text-slate-700">{dashIfEmpty(oc.contactPerson)}</p>
          </section>

          <p className="leading-relaxed text-slate-800">
            Angebot für Ihre Veranstaltung am <strong>{formatDateDe(oc.eventDate)}</strong>
            {oc.eventTime ? (
              <>
                {" "}
                um <strong>{oc.eventTime} Uhr</strong>
              </>
            ) : null}{" "}
            mit <strong>{draft.persons} Personen</strong>.
          </p>

          <section className="grid gap-1 text-sm sm:grid-cols-2">
            <p>
              <span className="text-slate-500">Anlieferung: </span>
              <span className="font-medium text-slate-900">
                {oc.eventTime ? `${oc.eventTime} Uhr, ` : ""}
                {dashIfEmpty(oc.location)}
              </span>
            </p>
          </section>

          {/* Itemized table */}
          <section>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-2 font-medium">Anzahl</th>
                  <th className="py-1.5 pr-2 font-medium">Bezeichnung</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Einzelpreis</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Gesamtpreis</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-slate-500">
                      Keine Positionen im Entwurf.
                    </td>
                  </tr>
                ) : (
                  draft.lines.map((line) => {
                    const it = itemsById[line.itemId];
                    const name = it?.name ?? line.snapshot.title;
                    const lineTotal = computeOfferLineTotal(line, draft.persons);
                    const unitLabel = isPieceUnitBasis(line.snapshot.price_type) ? "Stück" : "Person";
                    const composite = isCompositeLine(line, it);
                    const itemsIncluded = it?.items_included?.trim();
                    const note = line.customizationNote?.trim();

                    return (
                      <tr key={line.lineId} className="border-b border-slate-200 align-top">
                        <td className="py-2.5 pr-2 text-slate-700">
                          {line.quantity} {unitLabel}
                          <br />
                          <span className="text-xs text-slate-500">
                            {quantityModeLabel(line.quantityMode)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2">
                          <p className="font-semibold text-slate-900">{name}</p>
                          {composite && itemsIncluded ? (
                            <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600">
                              {itemsIncluded}
                            </pre>
                          ) : null}
                          {composite && note ? (
                            <p className="mt-1 whitespace-pre-wrap text-xs italic leading-relaxed text-slate-600">
                              Änderungswunsch: {note}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-500">
                            {it?.vat_rate_percent ?? 19}% MwSt.
                          </p>
                        </td>
                        <td className="py-2.5 pr-2 text-right text-slate-700">
                          {formatCurrency(line.snapshot.chosen_price)}
                        </td>
                        <td className="py-2.5 pl-2 text-right font-semibold text-slate-900">
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    );
                  })
                )}

                {pauschalen.buffetpauschale > 0 ? (
                  <tr className="border-b border-slate-200 text-slate-700">
                    <td className="py-2 pr-2">{draft.persons} Person</td>
                    <td className="py-2 pr-2">
                      Büffetpauschale
                      <span className="block text-xs text-slate-500">
                        (Chafing Dishes, Brennpaste, Kleinmaterial, Vorleger)
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {formatCurrency(pauschalen.buffetpauschale / draft.persons)}
                    </td>
                    <td className="py-2 pl-2 text-right font-semibold">
                      {formatCurrency(pauschalen.buffetpauschale)}
                    </td>
                  </tr>
                ) : null}
                {pauschalen.geschirrpauschale > 0 ? (
                  <tr className="border-b border-slate-200 text-slate-700">
                    <td className="py-2 pr-2">{draft.persons} Person</td>
                    <td className="py-2 pr-2">
                      Geschirrpauschale
                      <span className="block text-xs text-slate-500">(Geschirr, Besteck)</span>
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {formatCurrency(pauschalen.geschirrpauschale / draft.persons)}
                    </td>
                    <td className="py-2 pl-2 text-right font-semibold">
                      {formatCurrency(pauschalen.geschirrpauschale)}
                    </td>
                  </tr>
                ) : null}
                {pauschalen.anlieferung > 0 ? (
                  <tr className="border-b border-slate-200 text-slate-700">
                    <td className="py-2 pr-2">—</td>
                    <td className="py-2 pr-2">Anlieferung (Standardzone)</td>
                    <td className="py-2 pr-2 text-right">—</td>
                    <td className="py-2 pl-2 text-right font-semibold">
                      {formatCurrency(pauschalen.anlieferung)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {/* Kalkulation */}
          <section className="border-t-2 border-slate-800 pt-3">
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Positionen (netto)</span>
                <span className="font-medium text-slate-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-4 text-xs text-slate-500">
                <span>Preis pro Person (Positionen)</span>
                <span>{formatCurrency(pricePerPerson)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-1.5">
                <span className="font-medium text-slate-700">
                  Gesamtsumme inkl. Pauschalen (netto)
                </span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(pauschalen.grandTotal)}
                </span>
              </div>
              <div className="flex justify-between gap-4 text-xs text-slate-500">
                <span>zzgl. 7% MwSt. (auf {formatCurrency(vat.vat7Base)})</span>
                <span>{formatCurrency(vat.vat7Amount)}</span>
              </div>
              <div className="flex justify-between gap-4 text-xs text-slate-500">
                <span>zzgl. 19% MwSt. (auf {formatCurrency(vat.vat19Base)})</span>
                <span>{formatCurrency(vat.vat19Amount)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t-2 border-slate-800 pt-2">
                <span className="text-base font-bold text-slate-900">Gesamtsumme brutto</span>
                <span className="text-lg font-bold text-slate-900">
                  {formatCurrency(vat.totalInclVat)}
                </span>
              </div>
            </div>
          </section>

          <p className="text-xs text-slate-600">
            Zahlbar sofort rein netto nach Erhalt der Rechnung. Alle Preise verstehen sich zzgl.
            der zum Zeitpunkt der Rechnungsstellung gültigen Mehrwertsteuer.
          </p>

          <section className="rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-950">
            <h3 className="font-semibold text-amber-900">Hinweise</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>Änderungen am Paket müssen intern geprüft werden.</li>
              <li>Preis bleibt vorläufig.</li>
              <li className="font-semibold">
                ⚠ MwSt.-Sätze: 7% für Speisen (auch Büffets/Pakete), 19% für Getränke,
                Service/Personal und Equipment — nach dem seit 1.1.2026 geltenden ermäßigten
                Steuersatz für Speisen im Catering. Keine steuerliche Prüfung. Bitte vor
                Rechnungsstellung mit dem Steuerberater abstimmen. Die automatische USt.-Zuordnung
                gilt für Leistungen ab 01.01.2026; historische Leistungen werden nicht steuerlich
                bewertet.
              </li>
              <li className="font-semibold">
                ⚠ Allergenangaben sind, sofern nicht anders vermerkt, automatisch aus den
                Beschreibungen abgeleitet und küchenseitig ungeprüft — bei Kundenanfragen zu
                Allergien bitte vor Zusage in der Küche nachfragen.
              </li>
            </ul>
          </section>

          {/* Signature line */}
          <section className="grid grid-cols-2 gap-8 pt-6 text-xs text-slate-600">
            <p className="border-t border-slate-400 pt-1.5">Hamburg, den ____________________</p>
            <p className="border-t border-slate-400 pt-1.5">Stempel, Unterschrift</p>
          </section>

          {/* Legal footer, per Impressumspflicht. Sitz (registered seat) is
              Ahrensburg — that's what belongs next to the Handelsregister
              entry. Hinschenfelder Str. 60 is the Hamburg kitchen, not the
              legal seat; shown separately, not as the company's address. */}
          <footer className="grid gap-2 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500 sm:grid-cols-3">
            <p>
              Silberlöffel Catering GmbH
              <br />
              Geschäftsführer: Hinrich Both
              <br />
              Amtsgericht Lübeck, HRB 24548 HL
              <br />
              Sitz: Manhagener Allee 25a, 22926 Ahrensburg
            </p>
            <p>
              Küche Hamburg:
              <br />
              Hinschenfelder Str. 60
              <br />
              22041 Hamburg
            </p>
            <p>
              Tel. 040 – 22 94 73 0
              <br />
              www.silberloeffel-catering.de
              <br />
              kontakt@cooking.de
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
