import { useMemo, useState } from "react";
import type { CatalogItem, OfferDraft, QuantityMode } from "../../types";
import { formatCurrency, type PauschalenBreakdown, type VatBreakdown } from "../../utils/pricing";
import { computeBudgetBreakdown } from "../../utils/budgetBreakdown";
import { BudgetStatus } from "./BudgetStatus";
import { OfferLineItem } from "./OfferLineItem";
import { OfferPreview } from "./OfferPreview";

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";
export type PrepareStatus = "idle" | "preparing" | "done" | "error";

interface OfferSummaryProps {
  draft: OfferDraft;
  itemsById: Record<string, CatalogItem>;
  subtotal: number;
  pricePerPerson: number;
  pauschalen: PauschalenBreakdown;
  vat: VatBreakdown;
  onQuantityChange: (lineId: string, q: number) => void;
  onModeChange: (lineId: string, m: QuantityMode) => void;
  onCustomizationNoteChange: (lineId: string, note: string) => void;
  onRemove: (lineId: string) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onExportProposalJson: () => void;
  draftSaveStatus: DraftSaveStatus;
  draftSaveMessage: string | null;
  onSaveDraft: () => void | Promise<void>;
  prepareStatus: PrepareStatus;
  prepareMessage: string | null;
  canPrepareInCore: boolean;
  onPrepareInCore: () => void | Promise<void>;
}

/**
 * Split-screen Offer pane (operator-approved mockup,
 * CONFIGURATOR_OFFER_SUMMARY_INTEGER_INPUT_FIX_V1 follow-up): fixed
 * header (title + position count + Budget stat card), a scrollable
 * region containing *only* the selected-item rows, and a fixed footer
 * (totals, collapsed VAT/export disclosures, both final actions). Only
 * the middle region scrolls — the mockup's "structure only" scope is
 * honored by leaving the sidebar/top-bar/hero card from the previous
 * shell-alignment pass untouched.
 */
export function OfferSummary({
  draft,
  itemsById,
  subtotal,
  pricePerPerson,
  pauschalen,
  vat,
  onQuantityChange,
  onModeChange,
  onCustomizationNoteChange,
  onRemove,
  onExportJson,
  onExportCsv,
  onExportProposalJson,
  draftSaveStatus,
  draftSaveMessage,
  onSaveDraft,
  prepareStatus,
  prepareMessage,
  canPrepareInCore,
  onPrepareInCore,
}: OfferSummaryProps) {
  const { lines, persons, budgetEnabled, totalBudget, budgetType, budgetBasis, budgetScope } = draft;
  const [previewOpen, setPreviewOpen] = useState(false);

  const budgetBreakdown = useMemo(
    () =>
      computeBudgetBreakdown({
        budgetType,
        budgetBasis,
        budgetScope,
        configuredAmount: totalBudget,
        persons,
        subtotal,
        pauschalen,
        vat,
        formatCurrency,
      }),
    [budgetType, budgetBasis, budgetScope, totalBudget, persons, subtotal, pauschalen, vat]
  );

  /** Mirrors Core's own hard requirement (a PER_PERSON budget without a
   * valid guest count has nothing to compare against) — the prepare
   * action must not send Core a PER_PERSON budget_definition while the
   * operator has no way to see what it would evaluate to. TOTAL budgets
   * are never blocked by this — they don't depend on persons. */
  const budgetBlocksPrepare = budgetEnabled && budgetBreakdown.personsRequired;

  return (
    // OFFER_PANE_DESKTOP_TOP_ALIGNMENT_V1: `max-h` used to assume this pane
    // is already pinned at its `top-8` (2rem) sticky offset (`4rem` = top +
    // a matching bottom margin). But at scrollY=0 the pane hasn't stuck yet
    // — it renders at its natural in-flow position, which is *below* the
    // fixed TopBar (76px) plus the content area's top padding (34px) =
    // 110px, not 32px. Sizing for the old (stuck-only) assumption left the
    // pane's own bottom edge — and both final action buttons — below the
    // fold on first paint. 130px (110px natural top + 20px bottom margin)
    // is the real worst case: once actually scrolled and stuck at top-8,
    // the box has *more* headroom (900 - 32 = 868 vs this height), never
    // less, so tuning for the natural offset is always the tighter bound.
    <aside className="flex flex-col rounded-card border border-line bg-white shadow-card lg:sticky lg:top-8 lg:max-h-[calc(100vh-130px)]">
      {/* Fixed header — never scrolls: title/count, then the Budget stat
          card (only rendered when budget tracking is enabled). */}
      <div className="shrink-0 space-y-2 rounded-t-[18px] border-b border-line p-3 pb-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold text-ink">Aktuelles Angebot</h2>
          <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-muted">
            {lines.length} {lines.length === 1 ? "Position" : "Positionen"}
          </span>
        </div>
        <BudgetStatus enabled={budgetEnabled} breakdown={budgetBreakdown} />
        <p className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          Ausgewählte Positionen
        </p>
      </div>

      {/* Scrollable region — only the selected-item rows live here. On
          mobile/tablet this has no height constraint and just flows
          naturally with the rest of the card; the `lg:` classes are what
          turn it into an internal scroller once the summary becomes a
          bounded sticky column. */}
      <div
        data-testid="offer-summary-scroll-region"
        className="p-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        {lines.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-canvas/60 px-4 py-8 text-center text-sm text-muted">
            Noch keine Positionen. Wählen Sie links Artikel aus und fügen Sie sie hinzu.
          </p>
        ) : (
          <ul className="space-y-1">
            {lines.map((line) => (
              <OfferLineItem
                key={line.lineId}
                line={line}
                catalogItem={itemsById[line.itemId]}
                persons={persons}
                onQuantityChange={onQuantityChange}
                onModeChange={onModeChange}
                onCustomizationNoteChange={onCustomizationNoteChange}
                onRemove={onRemove}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Fixed footer — totals, Pauschalen and both final actions stay
          permanently visible; only the region above scrolls. The shadow is
          a scroll-affordance and only means anything once there's an
          actual internal scroller, so it's desktop-only. */}
      <div className="shrink-0 rounded-b-[18px] border-t border-line p-3 pt-2.5 lg:shadow-[0_-8px_16px_-12px_rgba(41,54,47,0.18)]">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted">Positionen ({lines.length})</span>
            <span className="text-xl font-bold text-ink">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted">Preis pro Person (Positionen)</span>
            <span className="font-semibold text-ink">{formatCurrency(pricePerPerson)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted">
            <span>Büffetpauschale</span>
            <span>{formatCurrency(pauschalen.buffetpauschale)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted">
            <span>Geschirrpauschale</span>
            <span>{formatCurrency(pauschalen.geschirrpauschale)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted">
            <span>Anlieferung (Standardzone)</span>
            <span>{formatCurrency(pauschalen.anlieferung)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-1.5">
            <span className="text-sm font-semibold text-ink" title="Gesamtsumme inkl. Pauschalen (netto)">
              Gesamt (netto)
            </span>
            <span className="text-xl font-bold text-ink">
              {formatCurrency(pauschalen.grandTotal)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted">
            <span>zzgl. 7% MwSt. (auf {formatCurrency(vat.vat7Base)})</span>
            <span>{formatCurrency(vat.vat7Amount)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted">
            <span>zzgl. 19% MwSt. (auf {formatCurrency(vat.vat19Base)})</span>
            <span>{formatCurrency(vat.vat19Amount)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink/80 pt-1.5">
            <span className="text-base font-bold text-ink" title="Gesamtsumme inkl. MwSt. (brutto)">
              Gesamt (brutto)
            </span>
            <span className="text-xl font-extrabold text-ink">{formatCurrency(vat.totalInclVat)}</span>
          </div>

          {/* Collapsed by default so the full legal wording doesn't
              permanently eat into the fixed footer — the numbers above are
              never hidden, only this explanatory text is. */}
          <details className="group rounded-control border border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1 text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span>MwSt.-Details</span>
              <ChevronDown />
            </summary>
            <p className="px-3 pb-2 text-xs leading-relaxed text-muted">
              ⚠ MwSt.-Sätze: 7% für Speisen (auch Büffets/Pakete), 19% für Getränke,
              Service/Personal und Equipment — nach dem seit 1.1.2026 geltenden ermäßigten
              Steuersatz für Speisen im Catering. Keine steuerliche Prüfung. Bitte vor
              Rechnungsstellung mit dem Steuerberater abstimmen. Die automatische
              USt.-Zuordnung gilt für Leistungen ab 01.01.2026; historische Leistungen werden
              nicht steuerlich bewertet.
            </p>
          </details>

          {/* Secondary utilities (save draft, exports) collapsed the same
              way — they're not part of the two final actions and don't
              need to compete with them for space. */}
          <details className="group rounded-control border border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1 text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span>Weitere Aktionen</span>
              <ChevronDown />
            </summary>
            <div className="space-y-1.5 px-3 pb-3">
              <button
                type="button"
                disabled={draftSaveStatus === "saving"}
                onClick={() => void onSaveDraft()}
                className="inline-flex h-9 w-full items-center justify-center rounded-control border border-line bg-white px-3 text-xs font-medium text-ink transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {draftSaveStatus === "saving" ? "Speichert…" : "Entwurf speichern"}
              </button>
              {draftSaveMessage ? (
                <p
                  className={`text-center text-xs ${
                    draftSaveStatus === "error" ? "font-semibold text-danger" : "text-muted"
                  }`}
                  role="status"
                >
                  {draftSaveMessage}
                </p>
              ) : null}

              <div className="flex flex-col gap-1.5 pt-1 sm:flex-row">
                <button
                  type="button"
                  onClick={onExportJson}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-control border border-line bg-white px-3 text-xs font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={onExportCsv}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-control border border-line bg-white px-3 text-xs font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
                >
                  Export CSV
                </button>
              </div>

              <button
                type="button"
                onClick={onExportProposalJson}
                className="inline-flex h-9 w-full items-center justify-center rounded-control border border-line bg-white px-3 text-xs font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
              >
                Export fürs Büro (JSON)
              </button>
              <p className="text-center text-[11px] leading-relaxed text-muted">
                Büro-Export (proposal_payload_v1): nur Vorschau-Daten für das Office Panel —
                erzeugt keinen Auftrag. Export für spätere Anbindung an Buchhaltung oder E-Mail.
              </p>
            </div>
          </details>
        </div>

        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-control border border-accent bg-white px-3 text-sm font-bold text-accent-deep transition hover:bg-accent-soft"
        >
          Angebotsvorschau anzeigen
        </button>

        {canPrepareInCore ? (
          <div className="mt-1.5 space-y-1.5 border-t border-line pt-1.5">
            <button
              type="button"
              disabled={prepareStatus === "preparing" || lines.length === 0 || budgetBlocksPrepare}
              onClick={() => void onPrepareInCore()}
              className="inline-flex h-10 w-full items-center justify-center rounded-control bg-accent px-3 text-sm font-bold text-white transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {prepareStatus === "preparing"
                ? "Bereite Angebot in Core vor…"
                : "Angebot in Core vorbereiten"}
            </button>
            {budgetBlocksPrepare ? (
              <p className="text-center text-xs font-semibold text-danger" role="alert">
                Personenzahl erforderlich, um das Pro-Person-Budget zu prüfen — Angebot kann
                erst vorbereitet werden, wenn eine gültige Personenzahl eingetragen ist.
              </p>
            ) : null}
            {prepareMessage ? (
              <p
                className={`text-center text-xs ${
                  prepareStatus === "error" ? "font-semibold text-danger" : "text-muted"
                }`}
                role="status"
              >
                {prepareMessage}
              </p>
            ) : null}
            <p className="text-center text-xs text-muted">
              Erstellt OfferSnapshot V2 und übergibt an Core prepare-offer.
            </p>
          </div>
        ) : null}
      </div>

      <OfferPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        draft={draft}
        itemsById={itemsById}
        subtotal={subtotal}
        pricePerPerson={pricePerPerson}
        pauschalen={pauschalen}
        vat={vat}
      />
    </aside>
  );
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-180"
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
