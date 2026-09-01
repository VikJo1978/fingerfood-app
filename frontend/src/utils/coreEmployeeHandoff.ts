export const CORE_HANDOFF_FRAGMENT_PREFIX = "#core-handoff=";

const MAX_CODE_CHARS = 512;
const CODE_RE = /^[A-Za-z0-9_-]+$/;
const CORE_HANDOFF_HISTORY_MARKER_SCHEMA = "fingerfood.core-handoff-history.v1";

export interface CoreHandoffHistoryMarker {
  schema_version: typeof CORE_HANDOFF_HISTORY_MARKER_SCHEMA;
  context_id: string;
}

function normalizeCode(raw: string): string | null {
  const code = raw.trim();
  if (!code || code.length > MAX_CODE_CHARS || CODE_RE.test(code) === false) {
    return null;
  }
  return code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeContextId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const contextId = raw.trim();
  if (!contextId || contextId.length > MAX_CODE_CHARS || CODE_RE.test(contextId) === false) {
    return null;
  }
  return contextId;
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

export function writeCoreHandoffHistoryMarker(
  contextId: string,
  location: Pick<Location, "pathname" | "search">,
  history: Pick<History, "replaceState">
): void {
  const normalized = normalizeContextId(contextId);
  if (normalized === null) return;
  history.replaceState(
    {
      schema_version: CORE_HANDOFF_HISTORY_MARKER_SCHEMA,
      context_id: normalized,
    } satisfies CoreHandoffHistoryMarker,
    "",
    `${location.pathname}${location.search}`
  );
}

export interface CoreInquiryReturnNavigation {
  assign(url: string): void;
}

export function returnToCoreInquiry(
  contextId: string,
  navigation: CoreInquiryReturnNavigation = window.location
): boolean {
  const normalized = normalizeContextId(contextId);
  if (normalized === null) return false;
  navigation.assign(`/api/ui/handoff/open-inquiry/${encodeURIComponent(normalized)}`);
  return true;
}

export function readCoreHandoffHistoryMarker(
  history: Pick<History, "state">
): CoreHandoffHistoryMarker | null {
  const state: unknown = history.state;
  if (!isRecord(state) || state.schema_version !== CORE_HANDOFF_HISTORY_MARKER_SCHEMA) {
    return null;
  }
  const contextId = normalizeContextId(state.context_id);
  if (contextId === null) return null;
  return {
    schema_version: CORE_HANDOFF_HISTORY_MARKER_SCHEMA,
    context_id: contextId,
  };
}
