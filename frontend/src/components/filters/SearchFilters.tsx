import { useMemo, useState } from "react";
import type { CatalogModuleFilter, PriceTypeFilter } from "../../services/api";
import { DIET_LABELS_DE, DIET_TYPES, type DietType } from "../../constants/classification";

const MODULE_CHIPS: { value: CatalogModuleFilter; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "food", label: "Speisen" },
  { value: "beverage", label: "Getränke" },
  { value: "packages", label: "Buffets & Pakete" },
  { value: "staff", label: "Personal" },
  { value: "tableware", label: "Geschirr" },
  { value: "equipment", label: "Equipment" },
];

interface SearchFiltersProps {
  catalogModule: CatalogModuleFilter;
  onCatalogModuleChange: (v: CatalogModuleFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  section: string;
  onSectionChange: (v: string) => void;
  sections: string[];
  priceType: PriceTypeFilter;
  onPriceTypeChange: (v: PriceTypeFilter) => void;
  diet: DietType | "";
  onDietChange: (v: DietType | "") => void;
  excludeAllergens: string;
  onExcludeAllergensChange: (v: string) => void;
  maxUnitPrice: string;
  onMaxUnitPriceChange: (v: string) => void;
}

export function SearchFilters({
  catalogModule,
  onCatalogModuleChange,
  search,
  onSearchChange,
  section,
  onSectionChange,
  sections,
  priceType,
  onPriceTypeChange,
  diet,
  onDietChange,
  excludeAllergens,
  onExcludeAllergensChange,
  maxUnitPrice,
  onMaxUnitPriceChange,
}: SearchFiltersProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const advancedFiltersActive = useMemo(() => {
    return (
      section.trim() !== "" ||
      priceType !== "" ||
      diet !== "" ||
      maxUnitPrice.trim() !== "" ||
      excludeAllergens.trim() !== ""
    );
  }, [section, priceType, diet, maxUnitPrice, excludeAllergens]);

  const advancedPanelId = "search-filters-advanced";

  return (
    <div className="space-y-4 rounded-card border border-line bg-white p-5 shadow-card">
      <div>
        <label className="sr-only" htmlFor="search">
          Suche
        </label>
        <input
          id="search"
          type="search"
          placeholder="Suche im Katalog (Speisen, Getränke, Personal, Geschirr, Equipment)…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-control border border-line bg-canvas/60 px-4 py-3 text-ink placeholder:text-muted focus:border-accent focus:bg-white"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          Baustein-Typ
        </span>
        <div className="flex flex-wrap gap-2">
          {MODULE_CHIPS.map(({ value, label }) => {
            const active = catalogModule === value;
            return (
              <button
                key={value === "" ? "all" : value}
                type="button"
                onClick={() => onCatalogModuleChange(value)}
                className={
                  active
                    ? "rounded-full border border-accent bg-accent px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-accent-deep"
                    : "rounded-full border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink shadow-sm transition hover:border-accent hover:bg-accent-soft"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        <button
          type="button"
          id={`${advancedPanelId}-toggle`}
          aria-expanded={advancedOpen}
          aria-controls={advancedPanelId}
          onClick={() => setAdvancedOpen((v) => !v)}
          className="text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          {advancedOpen ? "Weitere Filter ausblenden" : "Weitere Filter anzeigen"}
        </button>
        {advancedFiltersActive ? (
          <span className="text-xs font-medium text-muted">Erweiterte Filter aktiv</span>
        ) : null}
      </div>

      {advancedOpen ? (
        <div
          id={advancedPanelId}
          role="region"
          aria-labelledby={`${advancedPanelId}-toggle`}
          className="space-y-4 border-t border-line pt-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                Bereich
              </span>
              <select
                value={section}
                onChange={(e) => onSectionChange(e.target.value)}
                className="rounded-control border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-accent"
              >
                <option value="">Alle Bereiche</option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                Preisart
              </span>
              <select
                value={priceType}
                onChange={(e) => onPriceTypeChange(e.target.value as PriceTypeFilter)}
                className="rounded-control border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-accent"
              >
                <option value="">Alle</option>
                <option value="piece">Nach Stück</option>
                <option value="person">Nach Person</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                Ernährung
              </span>
              <select
                value={diet}
                onChange={(e) => onDietChange(e.target.value as DietType | "")}
                className="rounded-control border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-accent"
              >
                <option value="">Alle</option>
                {DIET_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {DIET_LABELS_DE[d]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                Höchstpreis pro Einheit
              </span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="kein Limit"
                value={maxUnitPrice}
                onChange={(e) => onMaxUnitPriceChange(e.target.value)}
                className="rounded-control border border-line bg-canvas/60 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:bg-white"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
              Allergene ausblenden
            </span>
            <input
              type="text"
              placeholder="z. B. gluten, milk, nuts"
              value={excludeAllergens}
              onChange={(e) => onExcludeAllergensChange(e.target.value)}
              className="rounded-control border border-line bg-canvas/60 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:bg-white"
            />
            <span className="text-xs text-muted">
              Blendet Artikel aus, die diese Stoffe ausweisen. Mehrere Einträge mit Komma trennen
              (z. B. gluten, milk, nuts).
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
