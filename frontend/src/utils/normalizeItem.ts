import { ALLERGENS, DIET_TYPES, type AllergenCode, type DietType } from "../constants/classification";
import type {
  CustomizationMode,
  FingerfoodItem,
  IngredientFlags,
  ItemKind,
  ItemModule,
  PriceType,
  PricingMode,
  SourceType,
} from "../types";

const DEFAULT_FLAGS: IngredientFlags = {
  contains_meat: false,
  contains_pork: false,
  contains_poultry: false,
  contains_beef: false,
  contains_fish: false,
  contains_shellfish: false,
  contains_dairy: false,
  contains_egg: false,
  contains_honey: false,
  contains_alcohol: false,
  contains_gelatin: false,
};

function isDietType(v: unknown): v is DietType {
  return typeof v === "string" && (DIET_TYPES as readonly string[]).includes(v);
}

function mergeIngredientFlags(input: unknown): IngredientFlags {
  const out: IngredientFlags = { ...DEFAULT_FLAGS };
  if (typeof input !== "object" || input === null) return out;
  const o = input as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_FLAGS) as (keyof IngredientFlags)[]) {
    if (typeof o[k] === "boolean") out[k] = o[k];
  }
  return out;
}

function sanitizeAllergens(input: unknown): AllergenCode[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(ALLERGENS as unknown as string[]);
  const out: AllergenCode[] = [];
  for (const x of input) {
    if (typeof x === "string" && allowed.has(x)) out.push(x as AllergenCode);
  }
  return out;
}

function isPriceType(v: unknown): v is PriceType {
  return v === "piece" || v === "person";
}

function isPricingMode(v: unknown): v is PricingMode {
  return v === "per_piece" || v === "per_person";
}

function isItemModule(v: unknown): v is ItemModule {
  return v === "food" || v === "beverage" || v === "staff" || v === "tableware";
}

function isSourceType(v: unknown): v is SourceType {
  return v === "internal" || v === "external";
}

function isItemKind(v: unknown): v is ItemKind {
  return v === "simple";
}

function isCustomizationMode(v: unknown): v is CustomizationMode {
  return v === "fixed";
}

/**
 * Makes API payloads safe for the UI (missing fields, older backend, partial JSON).
 */
export function normalizeFingerfoodItem(raw: unknown): FingerfoodItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  const name = typeof r.name === "string" ? r.name : null;
  if (!id || !name) return null;

  const price = typeof r.price === "number" && Number.isFinite(r.price) ? r.price : 0;
  const min_order =
    typeof r.min_order === "number" && Number.isFinite(r.min_order) && r.min_order >= 1
      ? Math.floor(r.min_order)
      : 1;
  const unit_label = typeof r.unit_label === "string" ? r.unit_label : "Stück";
  const category = typeof r.category === "string" ? r.category : "";
  const section = typeof r.section === "string" ? r.section : "";
  const subcategory =
    typeof r.subcategory === "string" || r.subcategory === null ? (r.subcategory as string | null) : null;
  const description = typeof r.description === "string" ? r.description : "";
  const items_included =
    typeof r.items_included === "string" || r.items_included === null
      ? (r.items_included as string | null)
      : null;

  const price_type: PriceType = isPriceType(r.price_type) ? r.price_type : "piece";
  const diet_type: DietType = isDietType(r.diet_type) ? r.diet_type : "omnivore";

  const module: ItemModule = isItemModule(r.module) ? r.module : "food";
  const source_type: SourceType = isSourceType(r.source_type) ? r.source_type : "internal";
  const item_kind: ItemKind = isItemKind(r.item_kind) ? r.item_kind : "simple";
  const pricing_mode: PricingMode = isPricingMode(r.pricing_mode)
    ? r.pricing_mode
    : price_type === "piece"
      ? "per_piece"
      : "per_person";
  const customization_mode: CustomizationMode = isCustomizationMode(r.customization_mode)
    ? r.customization_mode
    : "fixed";

  return {
    id,
    name,
    section,
    category,
    subcategory,
    price,
    price_type,
    min_order,
    unit_label,
    description,
    items_included,
    diet_type,
    ingredient_flags: mergeIngredientFlags(r.ingredient_flags),
    allergens: sanitizeAllergens(r.allergens),
    module,
    source_type,
    item_kind,
    pricing_mode,
    customization_mode,
  };
}

export function normalizeItemList(raw: unknown): FingerfoodItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FingerfoodItem[] = [];
  for (const row of raw) {
    const item = normalizeFingerfoodItem(row);
    if (item) out.push(item);
  }
  return out;
}
