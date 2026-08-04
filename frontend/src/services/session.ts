/** Browser session bootstrap for Configurator employee auth (AUTH-2E2). */

export type EmployeeAuthMode = "disabled" | "employee";

export interface SessionPrincipal {
  account_id: string;
  username: string;
  display_name: string;
  role: string;
}

export interface UiSessionState {
  employee_auth_mode: EmployeeAuthMode;
  authenticated: boolean;
  application_access_allowed: boolean;
  principal: SessionPrincipal | null;
  csrf_token: string | null;
}

export type SessionBootstrapStatus =
  | "loading"
  | "disabled"
  | "authenticated"
  | "not_authenticated"
  | "access_denied"
  | "unavailable";

let cachedCsrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return cachedCsrfToken;
}

export function clearCsrfToken(): void {
  cachedCsrfToken = null;
}

function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL ?? "";
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost";
}

function parseSessionPayload(value: unknown): UiSessionState | null {
  if (typeof value !== "object" || value === null) return null;
  const payload = value as Record<string, unknown>;
  const mode = payload.employee_auth_mode;
  if (mode !== "disabled" && mode !== "employee") return null;
  if (typeof payload.authenticated !== "boolean") return null;
  if (typeof payload.application_access_allowed !== "boolean") return null;
  const principalRaw = payload.principal;
  let principal: SessionPrincipal | null = null;
  if (principalRaw !== null) {
    if (typeof principalRaw !== "object" || principalRaw === null) return null;
    const p = principalRaw as Record<string, unknown>;
    if (
      typeof p.account_id !== "string"
      || typeof p.username !== "string"
      || typeof p.display_name !== "string"
      || typeof p.role !== "string"
    ) {
      return null;
    }
    principal = {
      account_id: p.account_id,
      username: p.username,
      display_name: p.display_name,
      role: p.role,
    };
  }
  const csrfToken = payload.csrf_token;
  if (csrfToken !== null && typeof csrfToken !== "string") return null;
  return {
    employee_auth_mode: mode,
    authenticated: payload.authenticated,
    application_access_allowed: payload.application_access_allowed,
    principal,
    csrf_token: csrfToken,
  };
}

export async function fetchUiSession(): Promise<{
  state: UiSessionState | null;
  status: SessionBootstrapStatus;
}> {
  let res: Response;
  try {
    res = await fetch(`${resolveBaseUrl()}/api/ui/session`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    cachedCsrfToken = null;
    return { state: null, status: "unavailable" };
  }
  if (res.status === 503) {
    cachedCsrfToken = null;
    return { state: null, status: "unavailable" };
  }
  if (!res.ok) {
    cachedCsrfToken = null;
    return { state: null, status: "unavailable" };
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    cachedCsrfToken = null;
    return { state: null, status: "unavailable" };
  }
  const state = parseSessionPayload(payload);
  if (state === null) {
    cachedCsrfToken = null;
    return { state: null, status: "unavailable" };
  }
  if (state.employee_auth_mode === "disabled") {
    cachedCsrfToken = null;
    return { state, status: "disabled" };
  }
  if (!state.authenticated) {
    cachedCsrfToken = null;
    return { state, status: "not_authenticated" };
  }
  if (!state.application_access_allowed) {
    cachedCsrfToken = null;
    return { state, status: "access_denied" };
  }
  cachedCsrfToken = state.csrf_token;
  return { state, status: "authenticated" };
}

export function sessionStatusMessage(status: SessionBootstrapStatus): string | null {
  switch (status) {
    case "not_authenticated":
      return "Bitte im Office Panel anmelden, um Angebote in Core vorzubereiten.";
    case "access_denied":
      return "Ihr Mitarbeiterkonto hat keinen Zugriff auf die Angebotsvorbereitung.";
    case "unavailable":
      return "Core-Mitarbeiterauthentifizierung ist derzeit nicht erreichbar.";
    default:
      return null;
  }
}
