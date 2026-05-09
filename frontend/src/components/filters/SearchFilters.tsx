import type { CatalogModuleFilter, PriceTypeFilter } from "../../services/api";
import { DIET_LABELS_DE, DIET_TYPES, type DietType } from "../../constants/classification";

const MODULE_CHIPS: { value: CatalogModuleFilter; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "food", label: "Speisen" },
  { value: "beverage", label: "Getränke" },
  { value: "packages", label: "Pakete" },
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
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
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
          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 outline-none ring-accent/30 placeholder:text-slate-400 focus:border-accent focus:bg-white focus:ring-2"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-slate-500">Baustein-Typ</span>
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
                    ? "rounded-full border border-accent bg-accent px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    : "rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">Bereich</span>
          <select
            value={section}
            onChange={(e) => onSectionChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-accent/30 focus:border-accent focus:ring-2"
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
          <span className="text-xs font-medium text-slate-500">Preisart</span>
          <select
            value={priceType}
            onChange={(e) => onPriceTypeChange(e.target.value as PriceTypeFilter)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-accent/30 focus:border-accent focus:ring-2"
          >
            <option value="">Alle</option>
            <option value="piece">Nach Stück</option>
            <option value="person">Nach Person</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">Ernährung</span>
          <select
            value={diet}
            onChange={(e) => onDietChange(e.target.value as DietType | "")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-accent/30 focus:border-accent focus:ring-2"
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
          <span className="text-xs font-medium text-slate-500">Höchstpreis pro Einheit</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="kein Limit"
            value={maxUnitPrice}
            onChange={(e) => onMaxUnitPriceChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none ring-accent/30 placeholder:text-slate-400 focus:border-accent focus:bg-white focus:ring-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-slate-500">Allergene ausblenden</span>
        <input
          type="text"
          placeholder="z. B. gluten, milk, nuts"
          value={excludeAllergens}
          onChange={(e) => onExcludeAllergensChange(e.target.value)}
          className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm outline-none ring-accent/30 placeholder:text-slate-400 focus:border-accent focus:bg-white focus:ring-2"
        />
        <span className="text-xs text-slate-400">
          Blendet Artikel aus, die diese Stoffe ausweisen. Mehrere Einträge mit Komma trennen (z. B. gluten, milk, nuts).
        </span>
      </label>
    </div>
  );
}
