export type MoneyParseResult = { ok: true; cents: number } | { ok: false; message: string };

export function parseGermanMoneyToCents(raw: string): MoneyParseResult {
  const value = raw.trim();
  if (value === "") return { ok: false, message: "Betrag erforderlich." };
  if (value.startsWith("-")) return { ok: false, message: "Negative Beträge sind nicht erlaubt." };
  const match = /^(\d+)(?:,(\d{0,2}))?$/.exec(value);
  if (!match) {
    return {
      ok: false,
      message: "Bitte einen Betrag mit maximal zwei Nachkommastellen eingeben.",
    };
  }
  const euros = Number(match[1]);
  if (!Number.isSafeInteger(euros)) return { ok: false, message: "Betrag ist zu groß." };
  const centsText = (match[2] ?? "").padEnd(2, "0");
  const cents = euros * 100 + Number(centsText);
  if (!Number.isSafeInteger(cents)) return { ok: false, message: "Betrag ist zu groß." };
  return { ok: true, cents };
}

export function formatCentsInput(cents: number): string {
  const safe = Math.max(0, Math.round(cents));
  const euros = Math.floor(safe / 100);
  const rest = String(safe % 100).padStart(2, "0");
  return `${euros},${rest}`;
}
