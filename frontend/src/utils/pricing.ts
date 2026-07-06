import type { CatalogItem, OfferLine, OfferWarning, PriceType, QuantityMode } from "../types";

/**
 * Line totals use `price_type` (unit basis: piece vs person), not `pricing_mode`.
 * `pricing_mode` is stored for catalog/API alignment; formulas may diverge later.
 */

/** True when `price` applies per catalog piece (`Stück`); false = per person (`Person`). */
export function isPieceUnitBasis(priceType: PriceType): boolean {
  return priceType === "piece";
}

/**
 * Line total from unit price and unit basis (`price_type`).
 * Same rules as `computeLineTotal`.
 */
export function computeLineTotalFromPrice(
  unitPrice: number,
  unitBasis: PriceType,
  persons: number,
  mode: QuantityMode,
  quantity: number
): number {
  if (isPieceUnitBasis(unitBasis)) {
    if (mode === "total") return unitPrice * quantity;
    return unitPrice * quantity * persons;
  }
  if (mode === "total") return unitPrice * quantity;
  return unitPrice * quantity * persons;
}

export function computeLineTotal(
  item: CatalogItem,
  persons: number,
  mode: QuantityMode,
  quantity: number
): number {
  return computeLineTotalFromPrice(item.price, item.price_type, persons, mode, quantity);
}

/**
 * Zeilensumme aus dem add-time Snapshot (gleiche Bezugsgröße wie angezeigter Stück-/Personenpreis).
 * Uses snapshot `price_type` (unit basis), not `pricing_mode`.
 * Kein Live-Katalog nötig.
 */
export function computeOfferLineTotal(line: OfferLine, persons: number): number {
  return computeLineTotalFromPrice(
    line.snapshot.chosen_price,
    line.snapshot.price_type,
    persons,
    line.quantityMode,
    line.quantity
  );
}

export function lineWarnings(
  item: CatalogItem,
  persons: number,
  mode: QuantityMode,
  quantity: number
): OfferWarning[] {
  const w: OfferWarning[] = [];
  if (mode === "total" && isPieceUnitBasis(item.price_type) && quantity < item.min_order) {
    w.push({
      code: "MIN_ORDER_PIECE",
      severity: "warning",
      message: `Hinweis: Diese Position wird normalerweise ab ${item.min_order} ${item.unit_label} bestellt.`,
    });
  }
  if (mode === "per_person" && persons < 10) {
    w.push({
      code: "PER_PERSON_BELOW_USUAL_MIN_PERSONS",
      severity: "warning",
      message:
        "Hinweis: Diese Konfiguration liegt unter dem üblichen Mindest-Personenzahl (10).",
    });
  }
  if (mode === "total" && !isPieceUnitBasis(item.price_type) && quantity < item.min_order) {
    w.push({
      code: "MIN_ORDER_PERSON",
      severity: "warning",
      message: `Hinweis: Übliches Minimum: ${item.min_order} Personen für diese Position.`,
    });
  }
  return w;
}

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

/**
 * Real Silberlöffel V1 flat fees — MUST mirror backend/app/services/pricing_service.py
 * PAUSCHALE_* constants exactly (checked by shared/pricing_fixtures.json parity tests).
 * Applied unconditionally per offer in V1; see backend comment for the
 * Anliefergebühr 30€/35€ sourcing decision.
 */
export const PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON = 0.5;
export const PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON = 2.0;
export const PAUSCHALE_ANLIEFERUNG_FLAT = 35.0;

export interface PauschalenBreakdown {
  buffetpauschale: number;
  geschirrpauschale: number;
  anlieferung: number;
  grandTotal: number;
}

export function computePauschalen(subtotal: number, persons: number): PauschalenBreakdown {
  const buffetpauschale = Math.round(PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON * persons * 100) / 100;
  const geschirrpauschale = Math.round(PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON * persons * 100) / 100;
  const anlieferung = Math.round(PAUSCHALE_ANLIEFERUNG_FLAT * 100) / 100;
  const grandTotal = Math.round((subtotal + buffetpauschale + geschirrpauschale + anlieferung) * 100) / 100;
  return { buffetpauschale, geschirrpauschale, anlieferung, grandTotal };
}
