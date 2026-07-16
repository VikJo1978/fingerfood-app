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
    <aside className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:sticky lg:top-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Aktuelles Angebot</h2>
        <p className="mt-1 text-sm text-slate-500">
          Hier sehen Sie Ihre Auswahl und die laufende Kalkulation.
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
          Noch keine Positionen. Wählen Sie links Artikel aus und fügen Sie sie hinzu.
        </p>
      ) : (
        <ul className="max-h-[min(28rem,50vh)] space-y-3 overflow-y-auto pr-1">
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

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-slate-600">Positionen</span>
          <span className="text-xl font-semibold text-slate-900">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-slate-600">Preis pro Person (Positionen)</span>
          <span className="font-semibold text-slate-800">{formatCurrency(pricePerPerson)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 text-xs text-slate-500">
          <span>Büffetpauschale</span>
          <span>{formatCurrency(pauschalen.buffetpauschale)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 text-xs text-slate-500">
          <span>Geschirrpauschale</span>
          <span>{formatCurrency(pauschalen.geschirrpauschale)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 text-xs text-slate-500">
          <span>Anlieferung (Standardzone)</span>
          <span>{formatCurrency(pauschalen.anlieferung)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-slate-100 pt-2">
          <span className="text-sm font-medium text-slate-700">Gesamtsumme inkl. Pauschalen (netto)</span>
          <span className="text-xl font-semibold text-slate-900">
            {formatCurrency(pauschalen.grandTotal)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-4 text-xs text-slate-500">
          <span>zzgl. 7% MwSt. (auf {formatCurrency(vat.vat7Base)})</span>
          <span>{formatCurrency(vat.vat7Amount)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 text-xs text-slate-500">
          <span>zzgl. 19% MwSt. (auf {formatCurrency(vat.vat19Base)})</span>
          <span>{formatCurrency(vat.vat19Amount)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-slate-100 pt-2">
          <span className="text-sm font-semibold text-slate-800">Gesamtsumme inkl. MwSt.</span>
          <span className="text-xl font-bold text-slate-900">{formatCurrency(vat.totalInclVat)}</span>
        </div>
        <p className="text-xs text-amber-900/80">
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
        className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-3 text-sm font-semibold text-accent transition hover:bg-accent/15"
      >
        Angebotsvorschau anzeigen
      </button>

      <div className="space-y-1.5">
        <button
          type="button"
          disabled={draftSaveStatus === "saving"}
          onClick={() => void onSaveDraft()}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {draftSaveStatus === "saving" ? "Speichert…" : "Entwurf speichern"}
        </button>
        {draftSaveMessage ? (
          <p
            className={`text-center text-xs ${
              draftSaveStatus === "error" ? "text-red-700" : "text-slate-600"
            }`}
            role="status"
          >
            {draftSaveMessage}
          </p>
        ) : null}
      </div>

      {canPrepareInCore ? (
        <div className="space-y-1.5 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={prepareStatus === "preparing" || lines.length === 0}
            onClick={() => void onPrepareInCore()}
            className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {prepareStatus === "preparing"
              ? "Bereite Angebot in Core vor…"
              : "Angebot in Core vorbereiten"}
          </button>
          {prepareMessage ? (
            <p
              className={`text-center text-xs ${
                prepareStatus === "error" ? "text-red-700" : "text-slate-600"
              }`}
              role="status"
            >
              {prepareMessage}
            </p>
          ) : null}
          <p className="text-center text-xs text-slate-400">
            Erstellt OfferSnapshot V2 und übergibt an Core prepare-offer.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
        <button
          type="button"
          onClick={onExportJson}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Export JSON
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>
      <p className="text-center text-xs text-slate-400">
        Export für spätere Anbindung an Buchhaltung oder E-Mail.
      </p>

      <button
        type="button"
        onClick={onExportProposalJson}
        className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
      >
        Export fürs Büro (JSON)
      </button>
      <p className="text-center text-xs text-slate-400">
        Büro-Export (proposal_payload_v1): nur Vorschau-Daten für das Office
        Panel — erzeugt keinen Auftrag.
      </p>

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
