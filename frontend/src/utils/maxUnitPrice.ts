/** Leer, 0 oder ungültig = kein Höchstpreis (alles anzeigen). */
export function parseMaxUnitPriceInput(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}
