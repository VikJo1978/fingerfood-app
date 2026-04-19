import type { AllergenCode, DietType } from "../constants/classification";

export type PriceType = "piece" | "person";

export type ItemModule = "food";

export type SourceType = "internal" | "external";

export type ItemKind = "simple";

export type PricingMode = "per_piece" | "per_person";

export type CustomizationMode = "fixed";

export type QuantityMode = "total" | "per_person";

export type WarningSeverity = "info" | "warning" | "blocking";

/** Structured pricing / validation notice (aligned with backend OfferWarning). */
export interface OfferWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
}

export interface IngredientFlags {
  contains_meat: boolean;
  contains_pork: boolean;
  contains_poultry: boolean;
  contains_beef: boolean;
  contains_fish: boolean;
  contains_shellfish: boolean;
  contains_dairy: boolean;
  contains_egg: boolean;
  contains_honey: boolean;
  contains_alcohol: boolean;
  contains_gelatin: boolean;
}

export interface FingerfoodItem {
  id: string;
  name: string;
  section: string;
  category: string;
  subcategory?: string | null;
  price: number;
  price_type: PriceType;
  min_order: number;
  unit_label: string;
  description: string;
  items_included?: string | null;
  diet_type: DietType;
  ingredient_flags: IngredientFlags;
  allergens: AllergenCode[];
  module: ItemModule;
  source_type: SourceType;
  item_kind: ItemKind;
  pricing_mode: PricingMode;
  customization_mode: CustomizationMode;
}

export interface OfferLine {
  lineId: string;
  itemId: string;
  quantityMode: QuantityMode;
  quantity: number;
}
