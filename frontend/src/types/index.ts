import type { AllergenCode, DietType } from "../constants/classification";

/**
 * How the catalog `price` is quoted in data (measurement / unit basis): per physical unit vs per person.
 * Drives line-total math and price labels together with quantity mode.
 */
export type PriceType = "piece" | "person";

export type ItemModule = "food" | "beverage" | "staff" | "tableware" | "equipment";

export type SourceType = "internal" | "external";

export type ItemKind = "simple" | "composite";

/**
 * Commercial charging mode from the catalog/API (`per_piece` | `per_person`).
 * Aligned with backend semantics; today often mirrors `price_type`, but kept separate for future rules.
 */
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

/** Unified catalog row (food, beverages, staff, tableware, equipment). */
export interface CatalogItem {
  id: string;
  name: string;
  section: string;
  category: string;
  subcategory?: string | null;
  /** Numeric unit price; meaning follows `price_type` (unit basis). */
  price: number;
  /** Unit basis for `price` (piece vs person). Used by the configurator for totals and copy. */
  price_type: PriceType;
  min_order: number;
  unit_label: string;
  description: string;
  items_included?: string | null;
  /** Present for food-like rows; omitted when not applicable (e.g. staff, tableware). */
  diet_type?: DietType;
  /** Food/beverage ingredient composition; optional for non-food modules. */
  ingredient_flags?: IngredientFlags;
  /** Declared allergens when relevant; optional for non-food modules. */
  allergens?: AllergenCode[];
  module: ItemModule;
  source_type: SourceType;
  item_kind: ItemKind;
  /** Commercial mode from catalog; snapshot for offers. Line math in UI still keys off `price_type` today. */
  pricing_mode: PricingMode;
  customization_mode: CustomizationMode;
}

/** @deprecated Prefer CatalogItem — legacy name from early fingerfood scope. */
export type FingerfoodItem = CatalogItem;

/** Minimal catalog fields captured when the line is added (add-time snapshot). */
export interface OfferLineCatalogSnapshot {
  title: string;
  source_type: SourceType;
  /** Commercial mode at add-to-offer time (from catalog). */
  pricing_mode: PricingMode;
  /** Unit basis at add-to-offer time; `computeOfferLineTotal` uses this with `chosen_price`. */
  price_type: PriceType;
  chosen_price: number;
  /** Simple line vs composite / package row (optional for older snapshots). */
  item_kind?: ItemKind;
}

export interface OfferLine {
  lineId: string;
  itemId: string;
  quantityMode: QuantityMode;
  quantity: number;
  snapshot: OfferLineCatalogSnapshot;
}

/** Compact order / event context (V1, in-memory only). */
export interface OrderContextV1 {
  companyName: string;
  contactPerson: string;
  eventDate: string;
  eventTime: string;
  location: string;
  remarks?: string;
}

/**
 * In-memory offer being edited in the configurator (not yet a persisted snapshot).
 * Totals stay derived in UI until a dedicated calculation/snapshot step owns them.
 */
export interface OfferDraft {
  orderContext: OrderContextV1;
  persons: number;
  budgetEnabled: boolean;
  totalBudget: number;
  lines: OfferLine[];
  /** Populated when server calculation is wired; optional for local-only flow. */
  warnings?: OfferWarning[];
}

/** Channel through which an inquiry entered (V1, types only). */
export type InquirySource = "web" | "phone" | "email" | "walk_in" | "referral" | "other";

/** Inquiry lifecycle stage (V1). */
export type InquiryStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "awaiting_customer"
  | "closed_won"
  | "closed_lost"
  | "archived";

/** Clarification / follow-up state on intake (V1). */
export type ClarificationState = "none" | "pending_internal" | "pending_customer" | "resolved";

/**
 * Full inquiry intake / protocol payload (V1, structural placeholder).
 * Boundary: holds complete intake; do not strip to configurator-only fields here.
 */
export interface InquiryV1 {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  source: InquirySource;
  status: InquiryStatus;
  clarificationState: ClarificationState;
  /** Full protocol blobs (messages, answers, attachments metadata, etc.). */
  protocol: Record<string, unknown>;
}

/**
 * Offer-configuration slice derived from planning (V1).
 * Boundary: only fields relevant to configuring an offer — not full inquiry data.
 */
export interface ConfiguratorPlanningContextV1 {
  persons: number;
  budget: number | null;
  budgetEnabled: boolean;
  desiredModules: ItemModule[];
  dietaryRequirements: string;
  eventType: string;
  serviceStyle: string;
}

export function createInitialOrderContextV1(): OrderContextV1 {
  return {
    companyName: "",
    contactPerson: "",
    eventDate: "",
    eventTime: "",
    location: "",
  };
}

export function createInitialOfferDraft(): OfferDraft {
  return {
    orderContext: createInitialOrderContextV1(),
    persons: 10,
    budgetEnabled: false,
    totalBudget: 500,
    lines: [],
  };
}
