import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { HeaderBar } from "../components/layout/HeaderBar";
import { InquiryIntake } from "../components/inquiry/InquiryIntake";
import { OrderContextCard } from "../components/OrderContextCard";
import { TopControls } from "../components/TopControls";
import { SearchFilters } from "../components/filters/SearchFilters";
import { ItemCard } from "../components/results/ItemCard";
import { OfferSummary } from "../components/summary/OfferSummary";
import type { CatalogModuleFilter, PriceTypeFilter } from "../services/api";
import { createDraft, fetchItems, updateDraft } from "../services/api";
import type { CatalogItem, InquiryToConfiguratorTransferV1, OfferLine, QuantityMode } from "../types";
import { createInitialOfferDraft } from "../types";
import { filterCatalog } from "../utils/filterCatalog";
import {
  computeOfferLineTotal,
  computePauschalen,
  computeVatBreakdown,
  formatCurrency,
  isPieceUnitBasis,
} from "../utils/pricing";
import {
  buildOfferSnapshotRequest,
  navigateToPreparedCoreOffer,
  prepareOfferInCore,
} from "../utils/offerSnapshotRequest";
import { buildProposalPayloadV1 } from "../utils/proposalExport";
import {
  consumeCoreInquiryHandoff,
} from "../utils/coreInquiryHandoff";
import { WarningBanner } from "../components/ui/WarningBanner";
import type { DietType } from "../constants/classification";

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type PageMode = "inquiry" | "configurator";

type DraftSaveStatus = "idle" | "saving" | "saved" | "error";
type PrepareStatus = "idle" | "preparing" | "done" | "error";

export function HomePage() {
  const [pageMode, setPageMode] = useState<PageMode>("inquiry");
  const [offerDraft, setOfferDraft] = useState(createInitialOfferDraft);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");
  const [draftSaveMessage, setDraftSaveMessage] = useState<string | null>(null);
  const [importedInquiryId, setImportedInquiryId] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [prepareStatus, setPrepareStatus] = useState<PrepareStatus>("idle");
  const [prepareMessage, setPrepareMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [priceType, setPriceType] = useState<PriceTypeFilter>("");
  const [diet, setDiet] = useState<DietType | "">("");
  const [excludeAllergens, setExcludeAllergens] = useState("");
  const [maxUnitPrice, setMaxUnitPrice] = useState("");
  const [catalogModule, setCatalogModule] = useState<CatalogModuleFilter>("");

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchItems({});
      setCatalog(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setSection("");
  }, [catalogModule]);

  const sectionOptions = useMemo(() => {
    let base = catalog;
    if (catalogModule === "food") {
      base = catalog.filter((i) => i.module === "food");
    } else if (catalogModule === "beverage") {
      base = catalog.filter((i) => i.module === "beverage");
    } else if (catalogModule === "staff") {
      base = catalog.filter((i) => i.module === "staff");
    } else if (catalogModule === "tableware") {
      base = catalog.filter((i) => i.module === "tableware");
    } else if (catalogModule === "equipment") {
      base = catalog.filter((i) => i.module === "equipment");
    } else if (catalogModule === "packages") {
      base = catalog.filter((i) => i.item_kind === "composite");
    }
    return Array.from(new Set(base.map((i) => i.section)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "de"));
  }, [catalog, catalogModule]);

  const visibleItems = useMemo(
    () =>
      filterCatalog(catalog, {
        search,
        section,
        priceType,
        diet,
        excludeAllergens,
        maxUnitPriceRaw: maxUnitPrice,
        module: catalogModule,
      }),
    [catalog, search, section, priceType, diet, excludeAllergens, maxUnitPrice, catalogModule]
  );

  const itemsById = useMemo(() => {
    const m: Record<string, CatalogItem> = {};
    for (const it of catalog) m[it.id] = it;
    return m;
  }, [catalog]);

  const { subtotal, pricePerPerson } = useMemo(() => {
    let sub = 0;
    for (const line of offerDraft.lines) {
      sub += computeOfferLineTotal(line, offerDraft.persons);
    }
    const ppp = offerDraft.persons > 0 ? sub / offerDraft.persons : 0;
    return { subtotal: Math.round(sub * 100) / 100, pricePerPerson: Math.round(ppp * 100) / 100 };
  }, [offerDraft.lines, offerDraft.persons]);

  const pauschalen = useMemo(
    () => computePauschalen(subtotal, offerDraft.persons, offerDraft.lines.length > 0),
    [subtotal, offerDraft.persons, offerDraft.lines.length]
  );

  const vat = useMemo(
    () => computeVatBreakdown(offerDraft, itemsById, pauschalen),
    [offerDraft, itemsById, pauschalen]
  );

  const clampPersons = (n: number) => Math.min(5000, Math.max(1, Math.round(n) || 1));

  const handlePrepareOffer = useCallback((transfer: InquiryToConfiguratorTransferV1) => {
    const { planning, orderContextPrefill: pre } = transfer;
    const remarksTrim = pre.remarks.trim();
    setOfferDraft((d) => ({
      ...d,
      persons: planning.persons === null ? d.persons : clampPersons(planning.persons),
      budgetEnabled: planning.budgetEnabled,
      totalBudget:
        planning.budgetEnabled && planning.budget != null
          ? Math.max(0, planning.budget)
          : d.totalBudget,
      orderContext: {
        ...d.orderContext,
        companyName: pre.companyName,
        contactPerson: pre.contactPerson,
        email: pre.email,
        phone: pre.phone,
        eventDate: pre.eventDate,
        eventTime: pre.eventTime,
        location: pre.location,
        billingAddress: pre.billingAddress.trim() ? pre.billingAddress.trim() : undefined,
        remarks: remarksTrim ? remarksTrim : undefined,
      },
    }));
    if (planning.desiredModules.length === 1) {
      setCatalogModule(planning.desiredModules[0]);
    }
    setPageMode("configurator");
  }, []);

  useEffect(() => {
    const result = consumeCoreInquiryHandoff(window.location, window.history);
    if (!result.present) return;
    if (result.handoff === null) {
      setHandoffError("Anfragedaten konnten nicht sicher übernommen werden.");
      return;
    }
    handlePrepareOffer(result.handoff.transfer);
    setImportedInquiryId(result.handoff.inquiry_id);
  }, [handlePrepareOffer]);

  const onAddLine = (
    item: CatalogItem,
    mode: QuantityMode,
    quantity: number,
    surchargeSelected: boolean
  ) => {
    const lineId = crypto.randomUUID();
    const hasSurcharge = item.surcharge_amount != null && !!item.surcharge_label;
    const line: OfferLine = {
      lineId,
      itemId: item.id,
      quantityMode: mode,
      quantity,
      // Both preserved for export/API; line totals use `price_type` + `chosen_price` (unit basis).
      snapshot: {
        title: item.name,
        source_type: item.source_type,
        pricing_mode: item.pricing_mode,
        price_type: item.price_type,
        chosen_price: item.price,
        item_kind: item.item_kind,
        // Frozen even when the item has no surcharge (undefined) or wasn't
        // selected (false) — keeps the audit trail of what was offered.
        ...(hasSurcharge
          ? {
              surchargeSelected,
              surchargeLabel: item.surcharge_label,
              surchargeAmount: item.surcharge_amount,
            }
          : {}),
      } satisfies OfferLine["snapshot"],
    };
    setOfferDraft((d) => ({ ...d, lines: [...d.lines, line] }));
  };

  const onRemoveLine = (lineId: string) => {
    setOfferDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.lineId !== lineId) }));
  };

  const onLineQty = (lineId: string, q: number) => {
    setOfferDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.lineId === lineId ? { ...l, quantity: Math.max(0.5, q) } : l
      ),
    }));
  };

  const onLineMode = (lineId: string, mode: QuantityMode) => {
    setOfferDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        if (l.lineId !== lineId) return l;
        const def = mode === "total" ? 10 : 1;
        return { ...l, quantityMode: mode, quantity: def };
      }),
    }));
  };

  const onLineCustomizationNote = (lineId: string, note: string) => {
    setOfferDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.lineId === lineId
          ? { ...l, customizationNote: note === "" ? undefined : note }
          : l
      ),
    }));
  };

  const exportPayload = () => {
    const lines = offerDraft.lines.map((l) => {
      const it = itemsById[l.itemId];
      const lineTotal = computeOfferLineTotal(l, offerDraft.persons);
      const itemsIncluded = it?.items_included?.trim();
      return {
        lineId: l.lineId,
        itemId: l.itemId,
        name: it?.name ?? l.snapshot.title,
        snapshot: l.snapshot,
        quantityMode: l.quantityMode,
        quantity: l.quantity,
        lineTotal,
        ...(l.customizationNote?.trim() ? { customizationNote: l.customizationNote.trim() } : {}),
        ...(itemsIncluded ? { itemsIncluded } : {}),
      };
    });
    return {
      meta: {
        orderContext: offerDraft.orderContext,
        persons: offerDraft.persons,
        budgetEnabled: offerDraft.budgetEnabled,
        totalBudgetEUR: offerDraft.budgetEnabled ? offerDraft.totalBudget : null,
        subtotalEUR: subtotal,
        pricePerPersonEUR: pricePerPerson,
      },
      lines,
    };
  };

  const onExportJson = () => {
    downloadText(
      `angebot-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(exportPayload(), null, 2),
      "application/json"
    );
  };

  const onExportProposalJson = () => {
    // Guard (accepted 2026-07-08): the Office Panel's /proposal-preview
    // validates event_date, so exporting without one would produce a file
    // that predictably fails import. Abort with a hint instead — nothing is
    // persisted or sent anywhere either way.
    if (!offerDraft.orderContext.eventDate) {
      alert(
        "Büro-Export braucht ein Eventdatum: bitte zuerst im Auftragskontext " +
          "das Datum setzen."
      );
      return;
    }
    const payload = buildProposalPayloadV1(
      offerDraft,
      itemsById,
      pauschalen.grandTotal,
      vat.totalInclVat,
      currentDraftId
    );
    downloadText(
      `proposal-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  };

  const onSaveDraft = useCallback(async () => {
    setDraftSaveStatus("saving");
    setDraftSaveMessage(null);
    try {
      if (currentDraftId === null) {
        const saved = await createDraft(offerDraft);
        setCurrentDraftId(saved.id);
      } else {
        await updateDraft(currentDraftId, offerDraft);
      }
      setDraftSaveStatus("saved");
      setDraftSaveMessage("Entwurf gespeichert.");
    } catch (e) {
      setDraftSaveStatus("error");
      setDraftSaveMessage(
        e instanceof Error ? e.message : "Entwurf konnte nicht gespeichert werden"
      );
    }
  }, [currentDraftId, offerDraft]);

  const onPrepareInCore = useCallback(async () => {
    if (!importedInquiryId) {
      setPrepareStatus("error");
      setPrepareMessage(
        "Angebot vorbereiten erfordert eine Core-Anfrage (Handoff aus dem Büro)."
      );
      return;
    }
    if (!offerDraft.orderContext.eventDate) {
      setPrepareStatus("error");
      setPrepareMessage("Bitte zuerst ein Eventdatum im Auftragskontext setzen.");
      return;
    }
    if (offerDraft.lines.length === 0) {
      setPrepareStatus("error");
      setPrepareMessage("Bitte mindestens eine Position hinzufügen.");
      return;
    }
    setPrepareStatus("preparing");
    setPrepareMessage(null);
    try {
      const body = buildOfferSnapshotRequest(
        offerDraft,
        importedInquiryId,
        currentDraftId
      );
      const result = await prepareOfferInCore(body);
      setPrepareStatus("done");
      setPrepareMessage(`Angebot in Core vorbereitet (${result.offer_id.slice(0, 8)}).`);
      navigateToPreparedCoreOffer(result);
    } catch (e) {
      setPrepareStatus("error");
      setPrepareMessage(
        e instanceof Error ? e.message : "Angebot konnte nicht vorbereitet werden."
      );
    }
  }, [currentDraftId, importedInquiryId, offerDraft]);

  const onExportCsv = () => {
    const header =
      "Position;Bezug;Menge;Preisart;Stück-/Personenpreis EUR;Name;Zeilensumme EUR;Änderungswunsch";
    const rows = offerDraft.lines.map((l) => {
      const it = itemsById[l.itemId];
      const lt = computeOfferLineTotal(l, offerDraft.persons);
      const modeDe = l.quantityMode === "total" ? "Gesamt" : "Pro Person";
      const pt = isPieceUnitBasis(l.snapshot.price_type) ? "Stück" : "Person";
      const unitPrice = l.snapshot.chosen_price;
      const rawName = it?.name ?? l.snapshot.title;
      const name = `"${rawName.replace(/"/g, '""')}"`;
      const noteRaw = l.customizationNote?.trim() ?? "";
      const noteCol = `"${noteRaw.replace(/"/g, '""')}"`;
      return `${l.itemId};${modeDe};${l.quantity};${pt};${unitPrice};${name};${lt.toFixed(2)};${noteCol}`;
    });
    const csv = [header, ...rows.filter(Boolean)].join("\n");
    downloadText(
      `angebot-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  };

  const showPersonWarning = offerDraft.persons < 10;

  if (pageMode === "inquiry") {
    return (
      <AppShell>
        <div className="space-y-8">
          <HeaderBar
            title="Neue Anfrage erfassen"
            subtitle="Weiches Anfrage-Protokoll für die Akquise — ohne Speicherung. Anschließend starten Sie den Konfigurator mit den wichtigsten Standardwerten."
          />
          {handoffError ? <WarningBanner message={handoffError} /> : null}
          <InquiryIntake onPrepareOffer={handlePrepareOffer} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <HeaderBar
          title="Catering-Angebot zusammenstellen"
          subtitle="Stellen Sie Ihr Catering-Angebot in wenigen Schritten zusammen — mit klarer Kalkulation und ohne Fachjargon."
        />

        {importedInquiryId ? (
          <WarningBanner
            message={`Aus Core-Anfrage ${importedInquiryId.slice(0, 8)} vorbefüllt. Bitte alle Angaben prüfen — noch kein Auftrag und keine Kundenbenachrichtigung.`}
          />
        ) : null}

        <p className="text-sm text-slate-500">
          <button
            type="button"
            onClick={() => setPageMode("inquiry")}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Zurück zur Anfrage
          </button>
          <span className="mx-2 text-slate-300">·</span>
          Konfigurator
        </p>

        <OrderContextCard
          orderContext={offerDraft.orderContext}
          onOrderContextChange={(patch) =>
            setOfferDraft((d) => ({
              ...d,
              orderContext: { ...d.orderContext, ...patch },
            }))
          }
        />

        <TopControls
          persons={offerDraft.persons}
          onPersonsChange={(n) =>
            setOfferDraft((d) => ({ ...d, persons: clampPersons(n) }))
          }
          budgetEnabled={offerDraft.budgetEnabled}
          onBudgetEnabledChange={(v) => setOfferDraft((d) => ({ ...d, budgetEnabled: v }))}
          totalBudget={offerDraft.totalBudget}
          onTotalBudgetChange={(n) =>
            setOfferDraft((d) => ({ ...d, totalBudget: Math.max(0, n) }))
          }
        />

        {showPersonWarning ? (
          <WarningBanner message="Hinweis: Viele Angebote und Positionen sind erst ab 10 Personen vorgesehen." />
        ) : null}

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {loadError}
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-5">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-slate-900">Angebotsbausteine auswählen</h2>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
                Wählen Sie Speisen, Getränke, Personal oder weitere Bausteine für das Angebot. Details
                und Mengen können pro Position angepasst werden.
              </p>
            </div>
            <SearchFilters
              catalogModule={catalogModule}
              onCatalogModuleChange={setCatalogModule}
              search={search}
              onSearchChange={setSearch}
              section={section}
              onSectionChange={setSection}
              sections={sectionOptions}
              priceType={priceType}
              onPriceTypeChange={setPriceType}
              diet={diet}
              onDietChange={setDiet}
              excludeAllergens={excludeAllergens}
              onExcludeAllergensChange={setExcludeAllergens}
              maxUnitPrice={maxUnitPrice}
              onMaxUnitPriceChange={setMaxUnitPrice}
            />

            {loading ? (
              <p className="text-sm text-slate-500">Artikel werden geladen…</p>
            ) : (
              <div className="space-y-4">
                {visibleItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                    Keine Treffer. Bitte Filter lockern oder Suche ändern.
                  </p>
                ) : (
                  visibleItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      persons={offerDraft.persons}
                      onAdd={onAddLine}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          <OfferSummary
            draft={offerDraft}
            itemsById={itemsById}
            subtotal={subtotal}
            pricePerPerson={pricePerPerson}
            pauschalen={pauschalen}
            vat={vat}
            onQuantityChange={onLineQty}
            onModeChange={onLineMode}
            onCustomizationNoteChange={onLineCustomizationNote}
            onRemove={onRemoveLine}
            onExportJson={onExportJson}
            onExportCsv={onExportCsv}
            onExportProposalJson={onExportProposalJson}
            draftSaveStatus={draftSaveStatus}
            draftSaveMessage={draftSaveMessage}
            onSaveDraft={onSaveDraft}
            prepareStatus={prepareStatus}
            prepareMessage={prepareMessage}
            canPrepareInCore={importedInquiryId !== null}
            onPrepareInCore={onPrepareInCore}
          />
        </div>

        <footer className="border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
          Keine Buchung — nur Orientierung. Summen: {formatCurrency(subtotal)} · Status:
          Entwurf
        </footer>
      </div>
    </AppShell>
  );
}
