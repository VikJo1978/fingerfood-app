import type { InquiryToConfiguratorTransferV1 } from "../types";
import { getCsrfToken } from "./session";

export interface ExchangedConfiguratorHandoff {
  context_id: string;
  operation: "prepare_first_offer";
  transfer: InquiryToConfiguratorTransferV1;
  expires_at: string;
}

function resolveBaseUrl(): string {
  const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
  const configured = (env.VITE_API_BASE_URL ?? env.VITE_API_URL ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTransfer(value: unknown): value is InquiryToConfiguratorTransferV1 {
  return isRecord(value) && isRecord(value.planning) && isRecord(value.orderContextPrefill);
}

function parseExchangeResponse(value: unknown): ExchangedConfiguratorHandoff | null {
  if (!isRecord(value)) return null;
  if (value.context_id === "" || typeof value.context_id !== "string") return null;
  if (value.operation !== "prepare_first_offer") return null;
  if (!isTransfer(value.transfer)) return null;
  if (typeof value.expires_at !== "string") return null;
  return {
    context_id: value.context_id,
    operation: value.operation,
    transfer: value.transfer,
    expires_at: value.expires_at,
  };
}

export async function exchangeCoreHandoff(code: string): Promise<ExchangedConfiguratorHandoff> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const response = await fetch(`${resolveBaseUrl()}/api/ui/handoff/exchange`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error("handoff_exchange_failed");
  }
  const payload = parseExchangeResponse(await response.json());
  if (payload === null) {
    throw new Error("handoff_exchange_invalid_response");
  }
  return payload;
}
