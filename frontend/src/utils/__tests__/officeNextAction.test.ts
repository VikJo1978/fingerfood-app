import { describe, expect, it } from "vitest";

import type { OfferDraft, OfferLine } from "../../types";
import { createInitialOfferDraft } from "../../types";
import { getOfficeNextAction, officePrepareHardBlocked } from "../officeNextAction";

const line: OfferLine = {
  lineId: "line-1",
  itemId: "item-1",
  quantityMode: "total",
  quantity: 10,
  snapshot: {
    title: "Testposition",
    source_type: "internal",
    pricing_mode: "per_piece",
    price_type: "piece",
    chosen_price: 2.5,
    item_kind: "simple",
  },
};

function readyDraft(): OfferDraft {
  const initial = createInitialOfferDraft();
  return {
    ...initial,
    persons: 25,
    lines: [line],
    paymentMethod: "VORKASSE",
    orderContext: {
      ...initial.orderContext,
      eventDate: "2026-09-20",
      eventStart: "18:00",
    },
    chargesDefinition: {
      ...initial.chargesDefinition,
      delivery: {
        ...initial.chargesDefinition.delivery,
        fulfillment: {
          ...initial.chargesDefinition.delivery.fulfillment!,
          fulfillmentMode: "PICKUP",
        },
      },
    },
  };
}

describe("getOfficeNextAction", () => {
  it("starts with fulfillment once persons and positions are present", () => {
    const draft = readyDraft();
    draft.chargesDefinition.delivery.fulfillment = {
      ...draft.chargesDefinition.delivery.fulfillment!,
      fulfillmentMode: "UNKNOWN",
    };

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "fulfillment",
      hardBlocker: true,
      actionLabel: "Lieferung oder Abholung wählen",
    });
  });

  it("treats legacy DELIVERY + UNKNOWN as the default same-address workflow", () => {
    const draft = readyDraft();
    draft.chargesDefinition.delivery.fulfillment = {
      ...draft.chargesDefinition.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "UNKNOWN",
    };

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "delivery_address",
      title: "Lieferadresse vervollständigen",
      actionLabel: "Lieferadresse ergänzen",
      hardBlocker: true,
    });
  });

  it("names the primary Lieferadresse when the same billing address is incomplete", () => {
    const draft = readyDraft();
    draft.chargesDefinition.delivery.fulfillment = {
      ...draft.chargesDefinition.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SAME_AS_INVOICE",
    };

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "delivery_address",
      title: "Lieferadresse vervollständigen",
      hardBlocker: true,
    });
  });

  it("names an incomplete separate delivery address explicitly", () => {
    const draft = readyDraft();
    draft.chargesDefinition.delivery.fulfillment = {
      ...draft.chargesDefinition.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SEPARATE",
    };

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "delivery_address",
      title: "Lieferadresse vervollständigen",
      hardBlocker: true,
    });
  });

  it("names the separate Rechnungsadresse only after the Lieferadresse is complete", () => {
    const draft = readyDraft();
    draft.chargesDefinition.delivery.fulfillment = {
      ...draft.chargesDefinition.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SEPARATE",
      deliveryAddress: {
        street: "Festplatz 3",
        postalCode: "22765",
        city: "Hamburg",
        country: "DE",
      },
    };

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "invoice_address",
      title: "Rechnungsadresse vervollständigen",
      hardBlocker: true,
    });
  });

  it("guides DELIVERY to the exact delivery time without making it a hard blocker", () => {
    const draft = readyDraft();
    draft.chargesDefinition.delivery.fulfillment = {
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SAME_AS_INVOICE",
      invoiceAddress: {
        street: "Musterstraße 1",
        postalCode: "20095",
        city: "Hamburg",
        country: "DE",
      },
      deliveryAddress: {
        street: "",
        postalCode: "",
        city: "",
        country: "DE",
      },
    };

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "delivery_time",
      hardBlocker: false,
    });
  });

  it("advances from delivery time to event start", () => {
    const draft = readyDraft();
    draft.orderContext.eventStart = undefined;
    draft.orderContext.eventTime = "";
    draft.orderContext.deliveryTime = "16:30";
    draft.chargesDefinition.delivery.fulfillment = {
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SAME_AS_INVOICE",
      invoiceAddress: {
        street: "Musterstraße 1",
        postalCode: "20095",
        city: "Hamburg",
        country: "DE",
      },
      deliveryAddress: {
        street: "",
        postalCode: "",
        city: "",
        country: "DE",
      },
    };

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "event_start",
      hardBlocker: false,
    });
  });

  it("points to incomplete same-day return logistics before payment", () => {
    const draft = readyDraft();
    draft.paymentMethod = undefined;
    draft.chargesDefinition.returnLogistics = {
      mode: "SAME_DAY",
      pickupWindowText: null,
      sameDayFeeCents: 3500,
    };

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "return_logistics",
      hardBlocker: true,
    });
  });

  it("points to payment after operational data is complete", () => {
    const draft = readyDraft();
    draft.paymentMethod = undefined;

    expect(getOfficeNextAction(draft)).toMatchObject({
      kind: "payment",
      hardBlocker: true,
    });
  });

  it("reports ready when the required workflow is complete", () => {
    expect(getOfficeNextAction(readyDraft())).toMatchObject({
      kind: "ready",
      hardBlocker: false,
    });
  });

  it("does not turn missing exact timing into a hard prepare blocker", () => {
    const draft = readyDraft();
    draft.orderContext.eventStart = undefined;
    draft.orderContext.eventTime = "";

    expect(getOfficeNextAction(draft).kind).toBe("event_start");
    expect(officePrepareHardBlocked(draft)).toBe(false);
  });

  it("still detects payment as a hard blocker behind advisory timing", () => {
    const draft = readyDraft();
    draft.orderContext.eventStart = undefined;
    draft.orderContext.eventTime = "";
    draft.paymentMethod = undefined;

    expect(officePrepareHardBlocked(draft)).toBe(true);
  });
});
