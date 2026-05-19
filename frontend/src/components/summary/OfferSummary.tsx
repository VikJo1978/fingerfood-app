import { useState } from "react";
import type { CatalogItem, OfferDraft, QuantityMode } from "../../types";
import { formatCurrency } from "../../utils/pricing";
import { BudgetStatus } from "./BudgetStatus";
import { OfferLineItem } from "./OfferLineItem";
import { OfferPreview } from "./OfferPreview";

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

interface OfferSummaryProps {
  draft: OfferDraft;
  itemsById: Record<string, CatalogItem>;
  subtotal: number;
  pricePerPerson: number;
  onQuantityChange: (lineId: string, q: number) => void;
  onModeChange: (lineId: string, m: QuantityMode) => void;
  onCustomizationNoteChange: (lineId: string, note: string) => void;
  onRemove: (lineId: string) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  draftSaveStatus: DraftSaveStatus;
  draftSaveMessage: string | null;
  onSaveDraft: () => void | Promise<void>;
}

export function OfferSummary({
  draft,
  itemsById,
  subtotal,
  pricePerPerson,
  onQuantityChange,
  onModeChange,
  onCustomizationNoteChange,
  onRemove,
  onExportJson,
  onExportCsv,
  draftSaveStatus,
  draftSaveMessage,
  onSaveDraft,
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
          <span className="text-sm text-slate-600">Gesamtsumme</span>
          <span className="text-xl font-semibold text-slate-900">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-slate-600">Preis pro Person</span>
          <span className="font-semibold text-slate-800">{formatCurrency(pricePerPerson)}</span>
        </div>
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

      <OfferPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        draft={draft}
        itemsById={itemsById}
        subtotal={subtotal}
        pricePerPerson={pricePerPerson}
      />
    </aside>
  );
}
