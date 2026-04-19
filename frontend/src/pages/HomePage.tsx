import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { HeaderBar } from "../components/layout/HeaderBar";
import { OrderContextCard } from "../components/OrderContextCard";
import { TopControls } from "../components/TopControls";
import { SearchFilters } from "../components/filters/SearchFilters";
import { ItemCard } from "../components/results/ItemCard";
import { OfferSummary } from "../components/summary/OfferSummary";
import type { CatalogModuleFilter, PriceTypeFilter } from "../services/api";
import { fetchItems } from "../services/api";
import type { FingerfoodItem, OfferLine, QuantityMode } from "../types";
import { createInitialOfferDraft } from "../types";
import { filterCatalog } from "../utils/filterCatalog";
import { computeOfferLineTotal, formatCurrency } from "../utils/pricing";
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

export function HomePage() {
  const [offerDraft, setOfferDraft] = useState(createInitialOfferDraft);

  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [priceType, setPriceType] = useState<PriceTypeFilter>("");
  const [diet, setDiet] = useState<DietType | "">("");
  const [excludeAllergens, setExcludeAllergens] = useState("");
  const [maxUnitPrice, setMaxUnitPrice] = useState("");
  const [catalogModule, setCatalogModule] = useState<CatalogModuleFilter>("");

  const [catalog, setCatalog] = useState<FingerfoodItem[]>([]);
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
    const m: Record<string, FingerfoodItem> = {};
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

  const clampPersons = (n: number) => Math.min(5000, Math.max(1, Math.round(n) || 1));

  const onAddLine = (item: FingerfoodItem, mode: QuantityMode, quantity: number) => {
    const lineId = crypto.randomUUID();
    const line: OfferLine = {
      lineId,
      itemId: item.id,
      quantityMode: mode,
      quantity,
      snapshot: {
        title: item.name,
        source_type: item.source_type,
        pricing_mode: item.pricing_mode,
        price_type: item.price_type,
        chosen_price: item.price,
      },
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

  const exportPayload = () => {
    const lines = offerDraft.lines.map((l) => {
      const it = itemsById[l.itemId];
      const lineTotal = computeOfferLineTotal(l, offerDraft.persons);
      return {
        lineId: l.lineId,
        itemId: l.itemId,
        name: it?.name ?? l.snapshot.title,
        snapshot: l.snapshot,
        quantityMode: l.quantityMode,
        quantity: l.quantity,
        lineTotal,
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

  const onExportCsv = () => {
    const header =
      "Position;Bezug;Menge;Preisart;Stück-/Personenpreis EUR;Name;Zeilensumme EUR";
    const rows = offerDraft.lines.map((l) => {
      const it = itemsById[l.itemId];
      const lt = computeOfferLineTotal(l, offerDraft.persons);
      const modeDe = l.quantityMode === "total" ? "Gesamt" : "Pro Person";
      const pt = l.snapshot.price_type === "piece" ? "Stück" : "Person";
      const unitPrice = l.snapshot.chosen_price;
      const rawName = it?.name ?? l.snapshot.title;
      const name = `"${rawName.replace(/"/g, '""')}"`;
      return `${l.itemId};${modeDe};${l.quantity};${pt};${unitPrice};${name};${lt.toFixed(2)}`;
    });
    const csv = [header, ...rows.filter(Boolean)].join("\n");
    downloadText(
      `angebot-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  };

  const showPersonWarning = offerDraft.persons < 10;

  return (
    <AppShell>
      <div className="space-y-8">
        <HeaderBar
          title="Catering-Angebot zusammenstellen"
          subtitle="Stellen Sie Ihr Catering-Angebot in wenigen Schritten zusammen — mit klarer Kalkulation und ohne Fachjargon."
        />

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
            onQuantityChange={onLineQty}
            onModeChange={onLineMode}
            onRemove={onRemoveLine}
            onExportJson={onExportJson}
            onExportCsv={onExportCsv}
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
