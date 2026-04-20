import type { FingerfoodItem, OfferDraft, OfferWarning } from "../types";
import type { DietType } from "../constants/classification";
import { normalizeItemList } from "../utils/normalizeItem";

const baseUrl = () => import.meta.env.VITE_API_URL ?? "";

export type CatalogModuleFilter =
  | ""
  | "food"
  | "beverage"
  | "staff"
  | "tableware"
  | "equipment";

export interface ItemQuery {
  search?: string;
  section?: string;
  price_type?: PriceTypeFilter;
  diet?: DietType | "";
  exclude_allergens?: string;
  max_unit_price?: number;
  /** Optional server-side filter; UI lädt den vollen Katalog für die Kalkulation. */
  module?: CatalogModuleFilter;
}

export type PriceTypeFilter = "" | "piece" | "person";

function buildQuery(params: ItemQuery): string {
  const q = new URLSearchParams();
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.section?.trim()) q.set("section", params.section.trim());
  if (params.price_type === "piece" || params.price_type === "person")
    q.set("price_type", params.price_type);
  if (params.diet === "vegetarian" || params.diet === "vegan" || params.diet === "pescetarian" || params.diet === "omnivore")
    q.set("diet", params.diet);
  if (params.exclude_allergens?.trim())
    q.set("exclude_allergens", params.exclude_allergens.trim());
  if (params.max_unit_price != null && params.max_unit_price > 0)
    q.set("max_unit_price", String(params.max_unit_price));
  if (
    params.module === "food" ||
    params.module === "beverage" ||
    params.module === "staff" ||
    params.module === "tableware" ||
    params.module === "equipment"
  )
    q.set("module", params.module);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchItems(params: ItemQuery = {}): Promise<FingerfoodItem[]> {
  const res = await fetch(`${baseUrl()}/api/items${buildQuery(params)}`);
  if (!res.ok) throw new Error(`Artikel konnten nicht geladen werden (${res.status})`);
  const data: unknown = await res.json();
  return normalizeItemList(data);
}

export async function fetchSections(): Promise<string[]> {
  const res = await fetch(`${baseUrl()}/api/items/sections`);
  if (!res.ok) throw new Error(`Bereiche konnten nicht geladen werden (${res.status})`);
  return res.json() as Promise<string[]>;
}

export interface OfferCalculateLine {
  item_id: string;
  quantity_mode: "total" | "per_person";
  quantity: number;
}

export interface OfferCalculateBody {
  persons: number;
  lines: OfferCalculateLine[];
}

/** Maps in-memory draft lines to the backend calculate payload (IDs and modes only). */
export function offerDraftToCalculateBody(draft: OfferDraft): OfferCalculateBody {
  return {
    persons: draft.persons,
    lines: draft.lines.map((l) => ({
      item_id: l.itemId,
      quantity_mode: l.quantityMode,
      quantity: l.quantity,
    })),
  };
}

export interface OfferCalculateResponse {
  persons: number;
  subtotal: number;
  price_per_person: number;
  lines: {
    item_id: string;
    quantity_mode: "total" | "per_person";
    quantity: number;
    line_total: number;
    warnings: OfferWarning[];
  }[];
  warnings: OfferWarning[];
}

export async function calculateOffer(body: OfferCalculateBody): Promise<OfferCalculateResponse> {
  const res = await fetch(`${baseUrl()}/api/offer/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kalkulation fehlgeschlagen (${res.status})`);
  return res.json() as Promise<OfferCalculateResponse>;
}
