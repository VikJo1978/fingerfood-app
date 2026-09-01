import type { CustomerAddressInput, DeliveryFulfillmentDefinition } from "../types";

function emptyAddress(): CustomerAddressInput {
  return { street: "", postalCode: "", city: "", country: "DE" };
}

export function parseLegacyLocationAddress(value: string): CustomerAddressInput | null {
  const raw = value.trim();
  if (!raw) return null;

  const full = /^(.+?),\s*(\d{5})\s+([^,]+?)(?:,\s*(.+))?$/.exec(raw);
  if (full) {
    return {
      street: full[1].trim(),
      postalCode: full[2].trim(),
      city: full[3].trim(),
      country: full[4]?.trim() || "DE",
    };
  }

  const postalCity = /^(\d{5})\s+(.+)$/.exec(raw);
  if (postalCity) {
    return {
      ...emptyAddress(),
      postalCode: postalCity[1].trim(),
      city: postalCity[2].trim(),
    };
  }

  const commaParts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      ...emptyAddress(),
      street: commaParts[0],
      city: commaParts.slice(1).join(", "),
    };
  }

  return { ...emptyAddress(), street: raw };
}

function mergeMissingAddressFields(
  current: CustomerAddressInput,
  fallback: CustomerAddressInput
): CustomerAddressInput {
  return {
    street: current.street.trim() || fallback.street,
    postalCode: current.postalCode.trim() || fallback.postalCode,
    city: current.city.trim() || fallback.city,
    country: current.country.trim() || fallback.country || "DE",
  };
}

export function applyLegacyLocationAddressFallback(
  fulfillment: DeliveryFulfillmentDefinition,
  location: string
): DeliveryFulfillmentDefinition {
  if (fulfillment.fulfillmentMode !== "DELIVERY") return fulfillment;

  const fallback = parseLegacyLocationAddress(location);
  if (fallback === null) return fulfillment;

  if (fulfillment.deliveryAddressMode === "SEPARATE") {
    return {
      ...fulfillment,
      deliveryAddress: mergeMissingAddressFields(fulfillment.deliveryAddress, fallback),
    };
  }

  return {
    ...fulfillment,
    invoiceAddress: mergeMissingAddressFields(fulfillment.invoiceAddress, fallback),
  };
}
