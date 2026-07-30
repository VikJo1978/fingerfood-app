import { useState } from "react";
import type { CatalogItem, OfferDraft, QuantityMode } from "../../types";
import { formatCurrency, type PauschalenBreakdown, type VatBreakdown } from "../../utils/pricing";
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
  const { lines, persons, budgetEnabled, totalBudget } = draft;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <aside className="flex flex-col rounded-card border border-line bg-white shadow-card lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)]">
      {/* Fixed header — never scrolls. */}
      <div className="shrink-0 rounded-t-[18px] border-b border-line p-5 pb-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
          Entwurf
        </p>
        <h2 className="mt-0.5 text-[17px] font-bold text-ink">Aktuelles Angebot</h2>
        <p className="mt-1 text-sm text-muted">
          Hier sehen Sie Ihre Auswahl und die laufende Kalkulation.
        </p>
      </div>

      {/* Scrollable region — only the line items and the secondary
          save/export utilities live here. On mobile/tablet this has no
          height constraint and just flows naturally with the rest of the
          card; the `lg:` classes are what turn it into an internal
          scroller once the summary becomes a bounded sticky column. */}
      <div
        data-testid="offer-summary-scroll-region"
        className="space-y-4 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        {lines.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-canvas/60 px-4 py-8 text-center text-sm text-muted">
            Noch keine Positionen. Wählen Sie links Artikel aus und fügen Sie sie hinzu.
          </p>
        ) : (
          <ul className="space-y-3">
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

        <div className="space-y-1.5 border-t border-line pt-4">
          <button
            type="button"
            disabled={draftSaveStatus === "saving"}
            onClick={() => void onSaveDraft()}
            className="inline-flex h-10 w-full items-center justify-center rounded-control border border-line bg-white px-3 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-control border border-line bg-white px-3 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-control border border-line bg-white px-3 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
          >
            Export CSV
          </button>
        </div>
        <p className="text-center text-xs text-muted">
          Export für spätere Anbindung an Buchhaltung oder E-Mail.
        </p>

        <button
          type="button"
          onClick={onExportProposalJson}
          className="inline-flex h-10 w-full items-center justify-center rounded-control border border-line bg-white px-3 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
        >
          Export fürs Büro (JSON)
        </button>
        <p className="text-center text-xs text-muted">
          Büro-Export (proposal_payload_v1): nur Vorschau-Daten für das Office
          Panel — erzeugt keinen Auftrag.
        </p>
      </div>

      {/* Fixed footer — totals, Pauschalen and both final actions stay
          permanently visible; only the region above scrolls. The shadow is
          a scroll-affordance and only means anything once there's an
          actual internal scroller, so it's desktop-only. */}
      <div className="shrink-0 rounded-b-[18px] border-t border-line p-5 pt-4 lg:shadow-[0_-8px_16px_-12px_rgba(41,54,47,0.18)]">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted">Positionen</span>
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
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
            <span className="text-sm font-semibold text-ink">Gesamtsumme inkl. Pauschalen (netto)</span>
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
          <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink/80 pt-2">
            <span className="text-base font-bold text-ink">Gesamtsumme inkl. MwSt.</span>
            <span className="text-xl font-extrabold text-ink">{formatCurrency(vat.totalInclVat)}</span>
          </div>
          <p className="rounded-control border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning">
            ⚠ MwSt.-Sätze: 7% für Speisen (auch Büffets/Pakete), 19% für Getränke, Service/Personal
            und Equipment — nach dem seit 1.1.2026 geltenden ermäßigten Steuersatz für Speisen im
            Catering. Keine steuerliche Prüfung. Bitte vor Rechnungsstellung mit dem Steuerberater
            abstimmen. Die automatische USt.-Zuordnung gilt für Leistungen ab 01.01.2026; historische
            Leistungen werden nicht steuerlich bewertet.
          </p>
          <BudgetStatus enabled={budgetEnabled} totalBudget={totalBudget} subtotal={subtotal} />
        </div>

        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-control border border-accent bg-white px-3 text-sm font-bold text-accent-deep transition hover:bg-accent-soft"
        >
          Angebotsvorschau anzeigen
        </button>

        {canPrepareInCore ? (
          <div className="mt-3 space-y-1.5 border-t border-line pt-3">
            <button
              type="button"
              disabled={prepareStatus === "preparing" || lines.length === 0}
              onClick={() => void onPrepareInCore()}
              className="inline-flex h-10 w-full items-center justify-center rounded-control bg-accent px-3 text-sm font-bold text-white transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {prepareStatus === "preparing"
                ? "Bereite Angebot in Core vor…"
                : "Angebot in Core vorbereiten"}
            </button>
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
