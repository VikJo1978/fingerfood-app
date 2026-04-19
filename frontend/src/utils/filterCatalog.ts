import { ALLERGENS } from "../constants/classification";
import type { DietType } from "../constants/classification";
import type { FingerfoodItem } from "../types";
import type { CatalogModuleFilter, PriceTypeFilter } from "../services/api";
import { parseMaxUnitPriceInput } from "./maxUnitPrice";

export function parseExcludeAllergenCodes(raw: string): Set<string> {
  const s = new Set<string>();
  const allowed = new Set<string>([...ALLERGENS]);
  for (const part of raw.split(",")) {
    const p = part.trim().toLowerCase();
    if (allowed.has(p)) s.add(p);
  }
  return s;
}

export interface CatalogFilterOpts {
  search: string;
  section: string;
  priceType: PriceTypeFilter;
  diet: DietType | "";
  excludeAllergens: string;
  maxUnitPriceRaw: string;
  module: CatalogModuleFilter;
}

export function filterCatalog(all: FingerfoodItem[], opts: CatalogFilterOpts): FingerfoodItem[] {
  let out = all;
  const q = opts.search.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.diet_type ?? "").toLowerCase().includes(q)
    );
  }
  if (opts.section.trim()) {
    out = out.filter((i) => i.section === opts.section.trim());
  }
  if (opts.priceType === "piece" || opts.priceType === "person") {
    out = out.filter((i) => i.price_type === opts.priceType);
  }
  if (opts.diet === "vegetarian" || opts.diet === "vegan" || opts.diet === "pescetarian" || opts.diet === "omnivore") {
    out = out.filter((i) => i.diet_type === opts.diet);
  }

  const avoid = parseExcludeAllergenCodes(opts.excludeAllergens);
  if (avoid.size) {
    out = out.filter((i) => !(i.allergens ?? []).some((a) => avoid.has(a)));
  }

  const cap = parseMaxUnitPriceInput(opts.maxUnitPriceRaw);
  if (cap != null && cap > 0 && Number.isFinite(cap)) {
    out = out.filter((i) => i.price <= cap);
  }
  if (opts.module === "food" || opts.module === "beverage") {
    out = out.filter((i) => i.module === opts.module);
  }
  return out;
}
