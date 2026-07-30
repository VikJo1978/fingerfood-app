/** "YYYY-MM-DD" (native date input) -> "DD.MM.YYYY" (real Angebote's format). */
export function formatDateDe(iso: string | undefined): string {
  const t = iso?.trim();
  if (!t) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return t;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
