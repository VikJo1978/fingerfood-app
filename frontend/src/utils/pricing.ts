import type { FingerfoodItem, QuantityMode } from "../types";

export function computeLineTotal(
  item: FingerfoodItem,
  persons: number,
  mode: QuantityMode,
  quantity: number
): number {
  if (item.price_type === "piece") {
    if (mode === "total") return item.price * quantity;
    return item.price * quantity * persons;
  }
  if (mode === "total") return item.price * quantity;
  return item.price * quantity * persons;
}

export function lineWarnings(
  item: FingerfoodItem,
  persons: number,
  mode: QuantityMode,
  quantity: number
): string[] {
  const w: string[] = [];
  if (mode === "total" && item.price_type === "piece" && quantity < item.min_order) {
    w.push(
      `Hinweis: Diese Position wird normalerweise ab ${item.min_order} ${item.unit_label} bestellt.`
    );
  }
  if (mode === "per_person" && persons < 10) {
    w.push(
      "Hinweis: Diese Konfiguration liegt unter dem üblichen Mindest-Personenzahl (10)."
    );
  }
  if (mode === "total" && item.price_type === "person" && quantity < item.min_order) {
    w.push(`Hinweis: Übliches Minimum: ${item.min_order} Personen für diese Position.`);
  }
  return w;
}

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
