import { describe, expect, it } from "vitest";

import type { DeliveryFulfillmentDefinition } from "../../types";
import {
  applyLegacyLocationAddressFallback,
  parseLegacyLocationAddress,
} from "../legacyLocationAddress";

function fulfillment(
  patch: Partial<DeliveryFulfillmentDefinition> = {}
): DeliveryFulfillmentDefinition {
  return {
    fulfillmentMode: "DELIVERY",
    deliveryAddressMode: "SAME_AS_INVOICE",
    invoiceAddress: { street: "", postalCode: "", city: "", country: "DE" },
    deliveryAddress: { street: "", postalCode: "", city: "", country: "DE" },
    ...patch,
  };
}

describe("legacy Inquiry location address fallback", () => {
  it("parses the common Straße, PLZ Ort form", () => {
    expect(parseLegacyLocationAddress("Musterstraße 1, 22549 Hamburg")).toEqual({
      street: "Musterstraße 1",
      postalCode: "22549",
      city: "Hamburg",
      country: "DE",
    });
  });

  it("preserves partial text instead of dropping it", () => {
    expect(parseLegacyLocationAddress("Musterstraße 1")).toEqual({
      street: "Musterstraße 1",
      postalCode: "",
      city: "",
      country: "DE",
    });
  });

  it("fills only missing fields and never overwrites structured Core facts", () => {
    const result = applyLegacyLocationAddressFallback(
      fulfillment({
        invoiceAddress: {
          street: "Schon gespeichert 7",
          postalCode: "",
          city: "",
          country: "DE",
        },
      }),
      "Musterstraße 1, 22549 Hamburg"
    );

    expect(result.invoiceAddress).toEqual({
      street: "Schon gespeichert 7",
      postalCode: "22549",
      city: "Hamburg",
      country: "DE",
    });
  });

  it("uses the delivery slot for SEPARATE handoffs", () => {
    const result = applyLegacyLocationAddressFallback(
      fulfillment({
        deliveryAddressMode: "SEPARATE",
        invoiceAddress: {
          street: "Rechnungsweg 7",
          postalCode: "22549",
          city: "Hamburg",
          country: "DE",
        },
      }),
      "Festplatz 3, 22765 Hamburg"
    );

    expect(result.deliveryAddress).toMatchObject({
      street: "Festplatz 3",
      postalCode: "22765",
      city: "Hamburg",
    });
    expect(result.invoiceAddress.street).toBe("Rechnungsweg 7");
  });

  it("does nothing for pickup", () => {
    const current = fulfillment({ fulfillmentMode: "PICKUP" });
    expect(applyLegacyLocationAddressFallback(current, "Musterstraße 1, 22549 Hamburg")).toEqual(
      current
    );
  });
});
