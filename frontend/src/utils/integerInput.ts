/** Strips everything but digits and collapses leading zeros, without
 * touching a string the user is still actively typing (e.g. "" stays "").
 * "03" -> "3", "030" -> "30", "9.5" -> "95" (decimal points are dropped,
 * never inserted — this is what makes fractional entry impossible). */
export function normalizeIntegerText(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly === "") return "";
  const stripped = digitsOnly.replace(/^0+(?=\d)/, "");
  return stripped;
}

/** Rounds, clamps to [min, max], and falls back to `min` for NaN/empty. */
export function clampInteger(n: number, min: number, max?: number): number {
  let v = Number.isFinite(n) ? Math.round(n) : min;
  v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}
