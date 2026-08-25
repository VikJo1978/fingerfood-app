import { describe, expect, it } from "vitest";

import type { OfferDraft } from "../../types";
import { createInitialChargesDefinition, createInitialCustomerAddressInput } from "../../types";
import { buildOfferSnapshotRequest } from "../offerSnapshotRequest";
import { computeChargesCents, computePauschalen } from "../pricing";

function draftWithFulfillment(
  mode: "PICKUP" | "DELIVERY",
  addressMode: "UNKNOWN" | "SAME_AS_INVOICE" | "SEPARATE" = "UNKNOWN"
): OfferDraft {
  const charges = createInitialChargesDefinition();
  const invoiceAddress = {
    ...createInitialCustomerAddressInput(),
    street: "Bürostraße 1",
    postalCode: "20095",
    city: "Hamburg",
    country: "DE",
  };
  const deliveryAddress = {
    ...createInitialCustomerAddressInput(),
    street: "Eventweg 2",
    postalCode: "20354",
    city: "Hamburg",
    country: "DE",
  };
  charges.delivery.fulfillment = {
    fulfillmentMode: mode,
    deliveryAddressMode: addressMode,
    invoiceAddress,
    deliveryAddress,
  };

  return {
    persons: 10,
    budgetEnabled: false,
    totalBudget: 0,
    budgetType: "total",
    budgetBasis: "gross",
    budgetScope: "full_offer",
    chargesDefinition: charges,
    lines: [],
    orderContext: {
      companyName: "Example GmbH",
      contactPerson: "Contact",
      email: "kunde@example.invalid",
      phone: "+49401234567",
      eventDate: "2026-09-01",
      eventTime: "18:00",
      location: "Hamburg",
      billingAddress: "Bürostraße 1, 20095 Hamburg",
      remarks: "",
    },
  };
}

describe("issue #150 fulfillment acceptance", () => {
  it("includes the configured delivery charge in the final offer total for delivery", () => {
    const draft = draftWithFulfillment("DELIVERY", "SAME_AS_INVOICE");

    const charges = computeChargesCents(draft.chargesDefinition, draft.persons);
    const total = computePauschalen(100, draft.persons, true, draft.chargesDefinition);
    const request = buildOfferSnapshotRequest(draft, "inq-150", null);

    expect(charges.deliveryCents).toBe(3500);
    expect(total.anlieferung).toBe(35);
    expect(total.grandTotal).toBe(135);
    expect(request.charges_definition.delivery.amount_cents).toBe(3500);
    expect(request.fulfillment).toEqual({
      fulfillment_mode: "DELIVERY",
      delivery_address_mode: "SAME_AS_INVOICE",
      invoice_address: {
        street: "Bürostraße 1",
        postal_code: "20095",
        city: "Hamburg",
        country: "DE",
      },
      delivery_address: null,
    });
  });

  it("suppresses the delivery charge and address for pickup without deleting the configured amount", () => {
    const draft = draftWithFulfillment("PICKUP");

    const charges = computeChargesCents(draft.chargesDefinition, draft.persons);
    const total = computePauschalen(100, draft.persons, true, draft.chargesDefinition);
    const request = buildOfferSnapshotRequest(draft, "inq-150", null);

    expect(draft.chargesDefinition.delivery.amountCents).toBe(3500);
    expect(charges.deliveryCents).toBe(0);
    expect(total.anlieferung).toBe(0);
    expect(total.grandTotal).toBe(100);
    expect(request.charges_definition.delivery.amount_cents).toBe(0);
    expect(request.fulfillment).toMatchObject({
      fulfillment_mode: "PICKUP",
      delivery_address_mode: "UNKNOWN",
      delivery_address: null,
    });
  });

  it("carries a separate delivery address in the prepare request", () => {
    const draft = draftWithFulfillment("DELIVERY", "SEPARATE");

    const request = buildOfferSnapshotRequest(draft, "inq-150", null);

    expect(request.fulfillment.delivery_address).toEqual({
      street: "Eventweg 2",
      postal_code: "20354",
      city: "Hamburg",
      country: "DE",
    });
  });
});
