import type { CatalogItem, OfferLine, OfferWarning, PriceType, QuantityMode } from "../types";

/** Line total from unit price and legacy `price_type` (same rules as `computeLineTotal`). */
export function computeLineTotalFromPrice(
  unitPrice: number,
  priceType: PriceType,
  persons: number,
  mode: QuantityMode,
  quantity: number
): number {
  if (priceType === "piece") {
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
  if (mode === "total" && item.price_type === "piece" && quantity < item.min_order) {
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
  if (mode === "total" && item.price_type === "person" && quantity < item.min_order) {
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
