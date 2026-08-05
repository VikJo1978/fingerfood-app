export const CORE_HANDOFF_FRAGMENT_PREFIX = "#core-handoff=";

const MAX_CODE_CHARS = 512;
const CODE_RE = /^[A-Za-z0-9_-]+$/;

function normalizeCode(raw: string): string | null {
  const code = raw.trim();
  if (!code || code.length > MAX_CODE_CHARS || CODE_RE.test(code) === false) {
    return null;
  }
  return code;
}

export function consumeCoreHandoffCode(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">
): { present: boolean; code: string | null } {
  if (!location.hash.startsWith(CORE_HANDOFF_FRAGMENT_PREFIX)) {
    return { present: false, code: null };
  }
  const code = normalizeCode(location.hash.slice(CORE_HANDOFF_FRAGMENT_PREFIX.length));
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return { present: true, code };
}
