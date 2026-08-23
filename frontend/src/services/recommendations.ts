import type { AllergenCode, DietType } from "../constants/classification";
import { getCsrfToken } from "./session";

export type RecommendationVariantKind = "ECONOMIC" | "RECOMMENDED" | "PREMIUM";
export type FulfillmentMode = "PICKUP" | "DELIVERY";

export interface RecommendationGenerateRequest {
  event_date: string;
  guest_count: number;
  event_type?: string | null;
  catering_format?: "fingerfood" | "buffet" | "mixed" | "other" | null;
  fulfillment_mode: FulfillmentMode;
  diet_type?: DietType | null;
  excluded_allergens?: AllergenCode[];
  no_pork?: boolean;
  preferred_categories?: string[];
  disliked_item_ids?: string[];
  must_have_item_ids?: string[];
  max_unit_net_cents?: number | null;
  max_variant_net_cents?: number | null;
  piece_quantity_by_item_id?: Record<string, number>;
}

export interface RecommendationVariantLine {
  item_id: string;
  quantity: number;
  unit_net_cents: number;
  net_total_cents: number;
  score: number;
  explanations: string[];
}

export interface RecommendationVariant {
  kind: RecommendationVariantKind;
  label: string;
  net_total_cents: number;
  explanations: string[];
  lines: RecommendationVariantLine[];
}

export interface RecommendationGenerateResponse {
  event_date: string;
  guest_count: number;
  catalog_revision: string;
  catalog_source: string;
  warnings: string[];
  production_signal_count: number;
  variants: RecommendationVariant[];
}

function resolveBaseUrl(): string {
  const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
  const configured = (env.VITE_API_BASE_URL ?? env.VITE_API_URL ?? "").trim();
  return configured ? configured.replace(/\/+$/, "") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResponse(value: unknown): RecommendationGenerateResponse | null {
  if (!isRecord(value)) return null;
  if (typeof value.event_date !== "string" || typeof value.guest_count !== "number") return null;
  if (typeof value.catalog_revision !== "string" || typeof value.catalog_source !== "string") return null;
  if (!Array.isArray(value.warnings) || !value.warnings.every((item) => typeof item === "string")) return null;
  if (typeof value.production_signal_count !== "number" || !Array.isArray(value.variants)) return null;

  const variants: RecommendationVariant[] = [];
  for (const rawVariant of value.variants) {
    if (!isRecord(rawVariant)) return null;
    if (
      rawVariant.kind !== "ECONOMIC" &&
      rawVariant.kind !== "RECOMMENDED" &&
      rawVariant.kind !== "PREMIUM"
    ) {
      return null;
    }
    if (
      typeof rawVariant.label !== "string" ||
      typeof rawVariant.net_total_cents !== "number" ||
      !Array.isArray(rawVariant.explanations) ||
      !rawVariant.explanations.every((item) => typeof item === "string") ||
      !Array.isArray(rawVariant.lines)
    ) {
      return null;
    }
    const lines: RecommendationVariantLine[] = [];
    for (const rawLine of rawVariant.lines) {
      if (!isRecord(rawLine)) return null;
      if (
        typeof rawLine.item_id !== "string" ||
        typeof rawLine.quantity !== "number" ||
        typeof rawLine.unit_net_cents !== "number" ||
        typeof rawLine.net_total_cents !== "number" ||
        typeof rawLine.score !== "number" ||
        !Array.isArray(rawLine.explanations) ||
        !rawLine.explanations.every((item) => typeof item === "string")
      ) {
        return null;
      }
      lines.push({
        item_id: rawLine.item_id,
        quantity: rawLine.quantity,
        unit_net_cents: rawLine.unit_net_cents,
        net_total_cents: rawLine.net_total_cents,
        score: rawLine.score,
        explanations: rawLine.explanations,
      });
    }
    variants.push({
      kind: rawVariant.kind,
      label: rawVariant.label,
      net_total_cents: rawVariant.net_total_cents,
      explanations: rawVariant.explanations,
      lines,
    });
  }

  return {
    event_date: value.event_date,
    guest_count: value.guest_count,
    catalog_revision: value.catalog_revision,
    catalog_source: value.catalog_source,
    warnings: value.warnings,
    production_signal_count: value.production_signal_count,
    variants,
  };
}

export async function generateRecommendations(
  payload: RecommendationGenerateRequest
): Promise<RecommendationGenerateResponse> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const response = await fetch(`${resolveBaseUrl()}/api/ui/recommendations/generate`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("recommendation_generate_failed");
  const parsed = parseResponse(await response.json());
  if (parsed === null) throw new Error("recommendation_generate_invalid_response");
  return parsed;
}
