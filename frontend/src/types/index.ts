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
  /** False (default): allergens mechanically derived from description text only,
   * NOT a checked food-safety declaration — UI must show a warning wherever
   * allergens are displayed. True: a human has reviewed and confirmed them. */
  allergens_verified?: boolean;
  /** Best-effort German catering VAT classification (7 or 19), NOT a
   * certified tax position — see backend scripts/derive_vat_rate.py. */
  vat_rate_percent?: 7 | 19;
  module: ItemModule;
  source_type: SourceType;
  item_kind: ItemKind;
  /** Commercial mode from catalog; snapshot for offers. Line math in UI still keys off `price_type` today. */
  pricing_mode: PricingMode;
  customization_mode: CustomizationMode;
  /** Single optional per-unit surcharge from the real menu text (e.g. "+1,00 €
   * Aufpreis für Lachs oder Rind" on Brötchen Mix 3/Sandwiches/Bagels) that the
   * fixed `price` can't express alone. Not a general variant system — one
   * optional checkbox per item. null/undefined for items with no such note. */
  surcharge_label?: string | null;
  surcharge_amount?: number | null;
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
  /** Whether the item's single optional surcharge (see CatalogItem.surcharge_amount)
   * was selected at add-time. Frozen with the label/amount for the audit trail
   * even when false, so it's clear the option existed and wasn't chosen. */
  surchargeSelected?: boolean;
  surchargeLabel?: string | null;
  surchargeAmount?: number | null;
}

export interface OfferLine {
  lineId: string;
  itemId: string;
  quantityMode: QuantityMode;
  quantity: number;
  snapshot: OfferLineCatalogSnapshot;
  /** Composite / Paket: freier Änderungswunsch (planning only; kein Preisdelta). */
  customizationNote?: string;
}

/** Compact order / event context (V1, in-memory only). */
export interface OrderContextV1 {
  companyName: string;
  contactPerson: string;
  email?: string;
  phone?: string;
  eventDate: string;
  eventTime: string;
  /** Lieferadresse / Veranstaltungsort — this is what the driver needs, always shown prominently. */
  location: string;
  /** Rechnungsadresse, only set if it differs from location. Kept deliberately
   * secondary in the UI/print layout (see OfferPreview) — drivers historically
   * misread a same-priority billing address and delivered to the wrong place. */
  billingAddress?: string;
  remarks?: string;
}

/** Whether `totalBudget` is a per-person rate (multiplied by `persons` for
 * comparison) or an already-absolute total for the whole offer. */
export type BudgetType = "per_person" | "total";
/** Whether the budget is compared against the netto or brutto (incl. VAT) total. */
export type BudgetBasis = "net" | "gross";
/** Whether the comparison total includes Pauschalen/delivery, or is limited
 * to the catalog positions (Speisen etc.) only. */
export type BudgetScope = "full_offer" | "positions_only";

export type ChargeBaseMode = "NONE" | "PAUSCHALE";

export interface DishwareAdditionalLine {
  lineId: string;
  description: string;
  quantity: number;
  unitNetCents: number;
}

export interface ChargesDefinition {
  buffet: {
    baseMode: ChargeBaseMode;
    pauschalePerPersonCents: number;
  };
  delivery: {
    amountCents: number;
  };
  dishware: {
    baseMode: ChargeBaseMode;
    pauschalePerPersonCents: number;
    additionalLines: DishwareAdditionalLine[];
  };
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
  /** Local UI-only budget presentation config — never sent to Core (see
   * utils/offerSnapshotRequest.ts, which does not reference budget at all). */
  budgetType: BudgetType;
  budgetBasis: BudgetBasis;
  budgetScope: BudgetScope;
  chargesDefinition: ChargesDefinition;
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
 * Boundary: planning-relevant inputs only — not Auftragskontext / Stammdaten.
 */
export interface ConfiguratorPlanningContextV1 {
  /** null means the source inquiry did not provide a count; keep the editable UI default. */
  persons: number | null;
  budget: number | null;
  budgetEnabled: boolean;
  desiredModules: ItemModule[];
  dietaryRequirements: string;
  eventType: string;
  serviceStyle: string;
}

/** Lightweight order-context prefill from inquiry intake (V1). UI-only bridge, not planning. */
export interface ConfiguratorOrderContextPrefillV1 {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  eventDate: string;
  eventTime: string;
  location: string;
  /** "" when the intake's billing address was left blank / not marked abweichend. */
  billingAddress: string;
  remarks: string;
}

/** Inquiry intake → Konfigurator: planning slice + order context prefill (V1). */
export interface InquiryToConfiguratorTransferV1 {
  planning: ConfiguratorPlanningContextV1;
  orderContextPrefill: ConfiguratorOrderContextPrefillV1;
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
    // Defaults preserve the exact previous (pre-selector) behavior: an
    // absolute total compared against the full brutto offer.
    budgetType: "total",
    budgetBasis: "gross",
    budgetScope: "full_offer",
    chargesDefinition: createInitialChargesDefinition(),
    lines: [],
  };
}

export function createInitialChargesDefinition(): ChargesDefinition {
  return {
    buffet: {
      baseMode: "NONE",
      pauschalePerPersonCents: 50,
    },
    delivery: {
      amountCents: 3500,
    },
    dishware: {
      baseMode: "NONE",
      pauschalePerPersonCents: 200,
      additionalLines: [],
    },
  };
}
