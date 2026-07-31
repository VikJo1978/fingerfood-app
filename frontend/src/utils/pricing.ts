import type { CatalogItem, OfferDraft, OfferLine, OfferWarning, PriceType, QuantityMode } from "../types";

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
 * Same rules as `computeLineTotal`. `surchargeAmount` is the item's single
 * optional per-unit surcharge (see CatalogItem.surcharge_amount), already
 * zeroed out by the caller when not selected/not configured — applied with
 * the same quantity-mode multiplier as the base price (mirrors backend
 * pricing_service.py `_line_total` + `_surcharge_total`).
 */
export function computeLineTotalFromPrice(
  unitPrice: number,
  unitBasis: PriceType,
  persons: number,
  mode: QuantityMode,
  quantity: number,
  surchargeAmount = 0
): number {
  const base = isPieceUnitBasis(unitBasis)
    ? mode === "total"
      ? unitPrice * quantity
      : unitPrice * quantity * persons
    : mode === "total"
      ? unitPrice * quantity
      : unitPrice * quantity * persons;
  const surcharge = mode === "total" ? surchargeAmount * quantity : surchargeAmount * quantity * persons;
  return base + surcharge;
}

export function computeLineTotal(
  item: CatalogItem,
  persons: number,
  mode: QuantityMode,
  quantity: number,
  surchargeSelected = false
): number {
  const surchargeAmount = surchargeSelected ? (item.surcharge_amount ?? 0) : 0;
  return computeLineTotalFromPrice(item.price, item.price_type, persons, mode, quantity, surchargeAmount);
}

/**
 * Zeilensumme aus dem add-time Snapshot (gleiche Bezugsgröße wie angezeigter Stück-/Personenpreis).
 * Uses snapshot `price_type` (unit basis), not `pricing_mode`.
 * Kein Live-Katalog nötig.
 */
export function computeOfferLineTotal(line: OfferLine, persons: number): number {
  const surchargeAmount = line.snapshot.surchargeSelected ? (line.snapshot.surchargeAmount ?? 0) : 0;
  return computeLineTotalFromPrice(
    line.snapshot.chosen_price,
    line.snapshot.price_type,
    persons,
    line.quantityMode,
    line.quantity,
    surchargeAmount
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

/**
 * Pauschalen only apply to an actual order — an empty offer (no lines) has
 * nothing to deliver, set up, or provide tableware for. Bug found
 * 2026-07-06: these were previously computed from `persons` alone, so an
 * empty draft already showed 60,00 € before anything was added.
 */
export function computePauschalen(
  subtotal: number,
  persons: number,
  hasLines: boolean
): PauschalenBreakdown {
  if (!hasLines) {
    return { buffetpauschale: 0, geschirrpauschale: 0, anlieferung: 0, grandTotal: 0 };
  }
  const buffetpauschale = Math.round(PAUSCHALE_BUFFETPAUSCHALE_PER_PERSON * persons * 100) / 100;
  const geschirrpauschale = Math.round(PAUSCHALE_GESCHIRRPAUSCHALE_PER_PERSON * persons * 100) / 100;
  const anlieferung = Math.round(PAUSCHALE_ANLIEFERUNG_FLAT * 100) / 100;
  const grandTotal = Math.round((subtotal + buffetpauschale + geschirrpauschale + anlieferung) * 100) / 100;
  return { buffetpauschale, geschirrpauschale, anlieferung, grandTotal };
}

/**
 * German catering VAT classification per the permanent 7% food rate
 * effective 1 Jan 2026: food (incl. buffets/packages) = 7%; beverages and
 * service/equipment = 19% — MUST mirror
 * backend/scripts/derive_vat_rate.py and backend/app/services/pricing_service.py
 * PAUSCHALEN_VAT_RATE_PERCENT exactly (checked by shared/pricing_fixtures.json
 * parity tests). Owner-stated rule, not independently verified — see UI disclaimer.
 */
export const PAUSCHALEN_VAT_RATE_PERCENT = 19;

export interface VatBreakdown {
  vat7Base: number;
  vat7Amount: number;
  vat19Base: number;
  vat19Amount: number;
  totalInclVat: number;
}

export function computeVatBreakdown(
  draft: Pick<OfferDraft, "lines" | "persons">,
  itemsById: Record<string, CatalogItem>,
  pauschalen: PauschalenBreakdown
): VatBreakdown {
  let vat7Base = 0;
  let vat19Base = 0;
  for (const line of draft.lines) {
    const total = computeOfferLineTotal(line, draft.persons);
    const rate = itemsById[line.itemId]?.vat_rate_percent ?? 19;
    if (rate === 7) vat7Base += total;
    else vat19Base += total;
  }
  vat19Base += pauschalen.buffetpauschale + pauschalen.geschirrpauschale + pauschalen.anlieferung;
  const vat7Amount = Math.round(vat7Base * 0.07 * 100) / 100;
  const vat19Amount = Math.round(vat19Base * 0.19 * 100) / 100;
  const totalInclVat = Math.round((pauschalen.grandTotal + vat7Amount + vat19Amount) * 100) / 100;
  return {
    vat7Base: Math.round(vat7Base * 100) / 100,
    vat7Amount,
    vat19Base: Math.round(vat19Base * 100) / 100,
    vat19Amount,
    totalInclVat,
  };
}

/**
 * "Positionen only, brutto" — the catalog positions' own price plus their
 * own VAT, deliberately excluding Pauschalen/Anlieferung and the VAT on
 * them. Used only for the budget transparency breakdown (POSITIONS_ONLY +
 * GROSS); the authoritative Positionen/Pauschalen/VAT totals shown
 * elsewhere are computed by `computeVatBreakdown` above and are
 * unaffected by this helper. `vat.vat7Base` is already positions-only
 * (Pauschalen are only ever added to the 19% bucket), so only the 19%
 * bucket needs the Pauschalen contribution subtracted back out before
 * applying the same `PAUSCHALEN_VAT_RATE_PERCENT` rate computeVatBreakdown
 * already uses.
 */
export function computePositionsOnlyGross(
  subtotal: number,
  vat: VatBreakdown,
  pauschalen: PauschalenBreakdown
): number {
  const pauschalenBeforeVat =
    pauschalen.buffetpauschale + pauschalen.geschirrpauschale + pauschalen.anlieferung;
  const itemsOnly19Base = Math.max(0, vat.vat19Base - pauschalenBeforeVat);
  const itemsOnly19Amount =
    Math.round(itemsOnly19Base * (PAUSCHALEN_VAT_RATE_PERCENT / 100) * 100) / 100;
  return Math.round((subtotal + vat.vat7Amount + itemsOnly19Amount) * 100) / 100;
}
