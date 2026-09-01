import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildBudgetDefinition,
  buildChargesDefinition,
  buildOfferSnapshotRequest,
  buildPrepareFulfillment,
  navigateToPreparedCoreOffer,
  parseOfferPrepareResponse,
  prepareAndNavigateToCoreOffer,
  prepareFulfillmentBlocker,
  prepareOfferErrorMessage,
  prepareOfferInCore,
} from "../offerSnapshotRequest";
import * as session from "../../services/session";
import { CORE_INQUIRY_FRAGMENT_PREFIX, parseCoreInquiryHandoff } from "../coreInquiryHandoff";
import type { OfferDraft } from "../../types";
import { createInitialChargesDefinition } from "../../types";

const draft = {
  persons: 10,
  budgetEnabled: false,
  totalBudget: 0,
  budgetType: "total",
  budgetBasis: "gross",
  budgetScope: "full_offer",
  chargesDefinition: createInitialChargesDefinition(),
  paymentMethod: "RECHNUNG",
  lines: [],
  orderContext: {
    companyName: "Example GmbH",
    contactPerson: "Contact",
    email: "a@example.invalid",
    phone: "",
    eventDate: "2026-08-20",
    eventTime: "18:00",
    location: "Hamburg",
    billingAddress: "Street 1",
    remarks: "",
  },
} satisfies OfferDraft;

const offerId = "33333333-3333-4333-8333-333333333333";
const validPrepareResponse = {
  offer_id: offerId,
};
const bffOpenPath = `/api/ui/offer/open/${offerId}`;

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("recipient postal address source", () => {
  it("prefers the structured invoice address over the legacy free-text billing address", () => {
    const body = buildOfferSnapshotRequest(
      {
        ...draft,
        chargesDefinition: {
          ...draft.chargesDefinition,
          delivery: {
            ...draft.chargesDefinition.delivery,
            fulfillment: {
              ...draft.chargesDefinition.delivery.fulfillment!,
              invoiceAddress: {
                street: "Neue Straße 2",
                postalCode: "22041",
                city: "Hamburg",
                country: "DE",
              },
            },
          },
        },
      },
      "inq-1",
      null
    );

    expect(body.recipient.postal_address).toBe("Neue Straße 2, 22041 Hamburg, DE");
  });

  it("keeps legacy billingAddress as a rolling-compatibility fallback", () => {
    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    expect(body.recipient.postal_address).toBe("Street 1");
  });

  it("does not treat the default country alone as a structured address", () => {
    const withLegacy: OfferDraft = {
      ...draft,
      orderContext: {
        ...draft.orderContext,
        billingAddress: "Legacy Straße 7",
      },
    };

    const body = buildOfferSnapshotRequest(withLegacy, "inq-1", null);
    expect(body.recipient.postal_address).toBe("Legacy Straße 7");
  });
});

describe("prepareOfferInCore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    session.clearCsrfToken();
  });

  it("calls the UI BFF route without Authorization header", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json(validPrepareResponse)
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    await prepareOfferInCore(body);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ui/offer/prepare");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.credentials).toBe("include");
    expect(JSON.stringify(init)).not.toContain("FINGERFOOD_API_TOKEN");
  });

  it("sends X-CSRF-Token when a csrf token is available in memory", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json(validPrepareResponse)
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(session, "getCsrfToken").mockReturnValue("csrf-test-token");

    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    await prepareOfferInCore(body);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-CSRF-Token": "csrf-test-token",
    });
  });

  it("accepts only a canonical offer id from the successful response", () => {
    expect(
      parseOfferPrepareResponse({
        ...validPrepareResponse,
        redirect_url: `https://attacker.example/offer/${offerId}`,
      })
    ).toEqual(validPrepareResponse);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["missing offer_id", {}],
    ["non-string offer_id", { ...validPrepareResponse, offer_id: 123 }],
    ["non-v4 UUID", { ...validPrepareResponse, offer_id: "not-a-uuid" }],
    [
      "UUIDv1",
      {
        ...validPrepareResponse,
        offer_id: "33333333-3333-1333-8333-333333333333",
      },
    ],
    [
      "non-canonical UUID",
      {
        ...validPrepareResponse,
        offer_id: "33333333-3333-4333-8333-33333333333A",
      },
    ],
  ])("rejects malformed successful payload: %s", (_case, payload) => {
    expect(() => parseOfferPrepareResponse(payload)).toThrow("invalid_prepare_response");
  });

  it("navigates only to the same-origin BFF open route", () => {
    const assign = vi.fn();
    const result = validPrepareResponse;

    navigateToPreparedCoreOffer(result, { assign });

    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(bffOpenPath);
  });

  it("shows a stable error without echoing Core response details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("snapshot customer@example.test secret-token", { status: 502 })
      )
    );

    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    await expect(prepareOfferInCore(body)).rejects.toMatchObject({
      code: "prepare_offer_failed",
      status: 502,
    });
    try {
      await prepareOfferInCore(body);
    } catch (error) {
      expect(String(error)).not.toContain("customer@example.test");
      expect(String(error)).not.toContain("secret-token");
    }
  });

  it("maps allow-listed BFF fulfillment errors to actionable messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { detail: { code: "fulfillment_mode_required", message: "private detail" } },
          { status: 422 }
        )
      )
    );

    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    let caught: unknown;
    try {
      await prepareOfferInCore(body);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "prepare_offer_failed",
      status: 422,
      detailCode: "fulfillment_mode_required",
    });
    expect(prepareOfferErrorMessage(caught)).toBe(
      "Bitte zuerst Lieferung oder Selbstabholung wählen."
    );
  });

  it.each([
    [
      "invalid_offer_snapshot",
      "Die Angebotsdaten sind widersprüchlich oder unvollständig. Bitte Positionen, Personenzahl und Pauschalen prüfen.",
    ],
    [
      "core_fulfillment_persist_failed",
      "Lieferart oder Adressdaten konnten nicht in Core gespeichert werden. Bitte die Anfrage neu öffnen und erneut versuchen.",
    ],
    [
      "core_offer_prepare_failed",
      "Core konnte das Angebot nicht anlegen. Die Eingaben wurden nicht als Angebot übernommen.",
    ],
  ])("maps known later prepare failure %s to an actionable message", async (code, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: { code } }, { status: 422 }))
    );

    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    let caught: unknown;
    try {
      await prepareOfferInCore(body);
    } catch (error) {
      caught = error;
    }

    expect(prepareOfferErrorMessage(caught)).toBe(expected);
  });

  it("never echoes unknown backend detail codes or response messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            detail: {
              code: "unexpected_private_error",
              message: "customer@example.test Bearer secret-token",
            },
          },
          { status: 422 }
        )
      )
    );

    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    let caught: unknown;
    try {
      await prepareOfferInCore(body);
    } catch (error) {
      caught = error;
    }

    const message = prepareOfferErrorMessage(caught);
    expect(message).toBe("Angebot konnte nicht vorbereitet werden.");
    expect(message).not.toContain("customer@example.test");
    expect(message).not.toContain("secret-token");
  });

  it("does not navigate or announce success when preparation fails", async () => {
    const assign = vi.fn();
    const onPrepared = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("snapshot customer@example.test secret-token", { status: 502 })
      )
    );

    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    await expect(
      prepareAndNavigateToCoreOffer(body, {
        navigation: { assign },
        onPrepared,
      })
    ).rejects.toThrow("prepare_offer_failed");

    expect(assign).not.toHaveBeenCalled();
    expect(onPrepared).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", () => new Response("<html>proxy error</html>")],
    ["missing field", () => Response.json({})],
    ["malformed UUID", () => Response.json({ ...validPrepareResponse, offer_id: "bad-id" })],
  ])(
    "does not navigate or announce success for a malformed 200 response: %s",
    async (_case, responseFactory) => {
      const assign = vi.fn();
      const onPrepared = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => responseFactory())
      );

      const body = buildOfferSnapshotRequest(draft, "inq-1", null);
      await expect(
        prepareAndNavigateToCoreOffer(body, {
          navigation: { assign },
          onPrepared,
        })
      ).rejects.toThrow("invalid_prepare_response");

      expect(assign).not.toHaveBeenCalled();
      expect(onPrepared).not.toHaveBeenCalled();
    }
  );

  it.each(["first creation", "idempotent replay", "canonical duplicate"])(
    "navigates after a validated %s response",
    async () => {
      const assign = vi.fn();
      const onPrepared = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(validPrepareResponse))
      );

      const body = buildOfferSnapshotRequest(draft, "inq-1", null);
      await prepareAndNavigateToCoreOffer(body, {
        navigation: { assign },
        onPrepared,
      });

      expect(onPrepared).toHaveBeenCalledWith(validPrepareResponse);
      expect(assign).toHaveBeenCalledWith(bffOpenPath);
    }
  );

  it("maps parser, JSON, schema, and arbitrary errors to fixed safe messages", () => {
    const privateMessage = "snapshot customer@example.test Bearer private-token";

    expect(
      prepareOfferErrorMessage(
        Object.assign(new Error("invalid_prepare_response"), {
          code: "invalid_prepare_response",
        })
      )
    ).toBe("Angebot konnte nicht vorbereitet werden.");
    expect(prepareOfferErrorMessage(new Error(privateMessage))).toBe(
      "Angebot konnte nicht vorbereitet werden."
    );
    expect(prepareOfferErrorMessage(privateMessage)).not.toContain(privateMessage);
    try {
      parseOfferPrepareResponse({ offer_id: "bad-id" });
    } catch (error) {
      expect(prepareOfferErrorMessage(error)).toBe(
        "Core hat eine ungültige Antwort zurückgegeben."
      );
    }
  });

  it("uses the inquiry_id decoded from the Core handoff", () => {
    const inquiryId = "64e32462-551b-4d31-9f5d-897fb53b639f";
    const encoded = encode({
      schema_version: "core_inquiry_offer_prefill_v1",
      source: "silberloeffel-core",
      inquiry_id: inquiryId,
      transfer: {
        planning: {
          persons: 10,
          budget: null,
          budgetEnabled: false,
          desiredModules: [],
          dietaryRequirements: "",
          eventType: "Jubiläum",
          serviceStyle: "",
        },
        orderContextPrefill: {
          companyName: draft.orderContext.companyName,
          contactPerson: draft.orderContext.contactPerson,
          email: draft.orderContext.email,
          phone: draft.orderContext.phone,
          eventDate: draft.orderContext.eventDate,
          eventTime: draft.orderContext.eventTime,
          location: draft.orderContext.location,
          billingAddress: draft.orderContext.billingAddress,
          remarks: draft.orderContext.remarks,
        },
      },
    });
    const handoff = parseCoreInquiryHandoff(`${CORE_INQUIRY_FRAGMENT_PREFIX}${encoded}`);
    expect(handoff).not.toBeNull();

    expect(buildOfferSnapshotRequest(draft, handoff!.inquiry_id, null).inquiry_id).toBe(inquiryId);
  });

  it("builds a same-authority prepare payload from context_id without inquiry_id", () => {
    const body = buildOfferSnapshotRequest(draft, null, "draft-1", "trusted-context-1");

    expect(body.context_id).toBe("trusted-context-1");
    expect(body).not.toHaveProperty("inquiry_id");
    expect(body.source_draft_id).toBe("draft-1");
  });
});

describe("payment method in the Core snapshot payload", () => {
  it.each([
    ["VORKASSE", "Zahlung per Vorkasse"],
    ["RECHNUNG", "Zahlung per Rechnung"],
    ["BAR_VOR_ORT", "Barzahlung vor Ort"],
  ] as const)("sends %s with canonical customer-visible text", (method, text) => {
    const body = buildOfferSnapshotRequest({ ...draft, paymentMethod: method }, "inq-1", null);

    expect(body.payment_terms).toEqual({
      method,
      customer_visible_text: text,
    });
  });

  it("refuses to build a payload until a payment method is selected", () => {
    expect(() =>
      buildOfferSnapshotRequest({ ...draft, paymentMethod: undefined }, "inq-1", null)
    ).toThrow("invalid_payment_method");
  });

  it("refuses Rechnung for a private customer", () => {
    expect(() =>
      buildOfferSnapshotRequest(
        {
          ...draft,
          paymentMethod: "RECHNUNG",
          orderContext: { ...draft.orderContext, companyName: "" },
        },
        "inq-1",
        null
      )
    ).toThrow("invalid_payment_method");
  });

  it("allows Bar vor Ort for both private and company customers", () => {
    expect(
      buildOfferSnapshotRequest(
        {
          ...draft,
          paymentMethod: "BAR_VOR_ORT",
          orderContext: { ...draft.orderContext, companyName: "" },
        },
        "inq-1",
        null
      ).payment_terms.method
    ).toBe("BAR_VOR_ORT");

    expect(
      buildOfferSnapshotRequest({ ...draft, paymentMethod: "BAR_VOR_ORT" }, "inq-1", null)
        .payment_terms.method
    ).toBe("BAR_VOR_ORT");
  });
});

describe("prepare fulfillment preflight", () => {
  it("blocks unresolved fulfillment before the BFF request", () => {
    expect(prepareFulfillmentBlocker(createInitialChargesDefinition())).toBe(
      "Bitte zuerst Lieferung oder Selbstabholung wählen."
    );
  });

  it("allows pickup without delivery address fields", () => {
    const charges = createInitialChargesDefinition();
    charges.delivery.fulfillment = {
      ...charges.delivery.fulfillment!,
      fulfillmentMode: "PICKUP",
      deliveryAddressMode: "UNKNOWN",
    };

    expect(prepareFulfillmentBlocker(charges)).toBeNull();
  });

  it("treats DELIVERY + UNKNOWN address mode as the default same-address case", () => {
    const charges = createInitialChargesDefinition();
    charges.delivery.fulfillment = {
      ...charges.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "UNKNOWN",
      invoiceAddress: {
        street: "Festplatz 3",
        postalCode: "22765",
        city: "Hamburg",
        country: "DE",
      },
    };

    expect(prepareFulfillmentBlocker(charges)).toBeNull();
    expect(buildPrepareFulfillment(charges)).toMatchObject({
      fulfillment_mode: "DELIVERY",
      delivery_address_mode: "SAME_AS_INVOICE",
      invoice_address: {
        street: "Festplatz 3",
        postal_code: "22765",
        city: "Hamburg",
        country: "DE",
      },
      delivery_address: null,
    });
  });

  it("requires the primary Lieferadresse for the default same-address case", () => {
    const charges = createInitialChargesDefinition();
    charges.delivery.fulfillment = {
      ...charges.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SAME_AS_INVOICE",
    };

    expect(prepareFulfillmentBlocker(charges)).toBe(
      "Bitte die Lieferadresse vollständig mit Straße, PLZ, Ort und Land angeben."
    );
  });

  it("requires Lieferadresse first and then the separate Rechnungsadresse", () => {
    const charges = createInitialChargesDefinition();
    charges.delivery.fulfillment = {
      ...charges.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SEPARATE",
    };

    expect(prepareFulfillmentBlocker(charges)).toBe(
      "Bitte die Lieferadresse vollständig mit Straße, PLZ, Ort und Land angeben."
    );

    charges.delivery.fulfillment.deliveryAddress = {
      street: "Festplatz 3",
      postalCode: "22765",
      city: "Hamburg",
      country: "DE",
    };

    expect(prepareFulfillmentBlocker(charges)).toBe(
      "Bitte die abweichende Rechnungsadresse vollständig mit Straße, PLZ, Ort und Land angeben."
    );
  });

  it("blocks a Lieferadresse that is otherwise filled but has no country", () => {
    const charges = createInitialChargesDefinition();
    charges.delivery.fulfillment = {
      ...charges.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SEPARATE",
      deliveryAddress: {
        street: "Auf dem Königslande 4",
        postalCode: "22041",
        city: "Hamburg",
        country: "",
      },
    };

    expect(prepareFulfillmentBlocker(charges)).toBe(
      "Bitte die Lieferadresse vollständig mit Straße, PLZ, Ort und Land angeben."
    );
  });

  it("allows complete separate Liefer- und Rechnungsadressen", () => {
    const charges = createInitialChargesDefinition();
    charges.delivery.fulfillment = {
      ...charges.delivery.fulfillment!,
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SEPARATE",
      invoiceAddress: {
        street: "Rechnungsweg 7",
        postalCode: "22549",
        city: "Hamburg",
        country: "DE",
      },
      deliveryAddress: {
        street: "Auf dem Königslande 4",
        postalCode: "22041",
        city: "Hamburg",
        country: "DE",
      },
    };

    expect(prepareFulfillmentBlocker(charges)).toBeNull();
  });
});

describe("budget_definition in the Core snapshot payload", () => {
  it("is omitted entirely when budget tracking is disabled", () => {
    const body = buildOfferSnapshotRequest({ ...draft, budgetEnabled: false }, "inq-1", null);
    expect(body.budget_definition).toBeUndefined();
    expect("budget_definition" in body).toBe(false);
  });

  it("sends all four fields with the exact amount representation (integer euro cents)", () => {
    const enabled: OfferDraft = {
      ...draft,
      budgetEnabled: true,
      totalBudget: 35,
      budgetType: "per_person",
      budgetBasis: "net",
      budgetScope: "positions_only",
    };
    const body = buildOfferSnapshotRequest(enabled, "inq-1", null);
    expect(body.budget_definition).toEqual({
      amount_cents: 3500,
      type: "PER_PERSON",
      tax_basis: "NET",
      cost_scope: "POSITIONS_ONLY",
    });
  });

  it("maps every budgetType/budgetBasis/budgetScope combination to the exact Core enum casing", () => {
    const cases: Array<{
      budgetType: OfferDraft["budgetType"];
      budgetBasis: OfferDraft["budgetBasis"];
      budgetScope: OfferDraft["budgetScope"];
      expected: { type: string; tax_basis: string; cost_scope: string };
    }> = [
      {
        budgetType: "total",
        budgetBasis: "gross",
        budgetScope: "full_offer",
        expected: { type: "TOTAL", tax_basis: "GROSS", cost_scope: "FULL_OFFER" },
      },
      {
        budgetType: "total",
        budgetBasis: "net",
        budgetScope: "positions_only",
        expected: { type: "TOTAL", tax_basis: "NET", cost_scope: "POSITIONS_ONLY" },
      },
      {
        budgetType: "per_person",
        budgetBasis: "gross",
        budgetScope: "positions_only",
        expected: { type: "PER_PERSON", tax_basis: "GROSS", cost_scope: "POSITIONS_ONLY" },
      },
      {
        budgetType: "per_person",
        budgetBasis: "net",
        budgetScope: "full_offer",
        expected: { type: "PER_PERSON", tax_basis: "NET", cost_scope: "FULL_OFFER" },
      },
    ];
    for (const { budgetType, budgetBasis, budgetScope, expected } of cases) {
      const definition = buildBudgetDefinition({
        ...draft,
        budgetEnabled: true,
        totalBudget: 100,
        budgetType,
        budgetBasis,
        budgetScope,
      });
      expect(definition).toMatchObject(expected);
    }
  });

  it("rounds fractional euro amounts to the nearest cent, never emitting a float amount", () => {
    const definition = buildBudgetDefinition({
      ...draft,
      budgetEnabled: true,
      totalBudget: 35.005,
    });
    expect(definition?.amount_cents).toBe(3501);
    expect(Number.isInteger(definition?.amount_cents)).toBe(true);
  });

  it("clamps a negative budget amount to zero cents rather than sending a negative value", () => {
    const definition = buildBudgetDefinition({
      ...draft,
      budgetEnabled: true,
      totalBudget: -50,
    });
    expect(definition?.amount_cents).toBe(0);
  });

  it("does not attach budget_definition to the offer/positions sub-object", () => {
    const body = buildOfferSnapshotRequest(
      { ...draft, budgetEnabled: true, totalBudget: 35 },
      "inq-1",
      null
    );
    expect("budget_definition" in body.offer).toBe(false);
  });
});

describe("charges_definition in the Core snapshot payload", () => {
  it("is always sent with the approved new-draft defaults", () => {
    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    expect(body.charges_definition).toEqual({
      delivery: { amount_cents: 3500 },
      dishware: {
        base_mode: "NONE",
        pauschale_per_person_cents: 200,
        additional_lines: [],
      },
      buffet: {
        base_mode: "NONE",
        pauschale_per_person_cents: 50,
      },
      return_logistics: {
        mode: "NEXT_WORKING_DAY",
        pickup_window_text: null,
        same_day_fee_cents: 0,
      },
    });
  });

  it("serializes editable charges as integer cents without UI-only fields or line totals", () => {
    const body = buildOfferSnapshotRequest(
      {
        ...draft,
        persons: 12,
        chargesDefinition: {
          buffet: { baseMode: "PAUSCHALE", pauschalePerPersonCents: 75 },
          delivery: { amountCents: 0 },
          dishware: {
            baseMode: "NONE",
            pauschalePerPersonCents: 200,
            additionalLines: [
              {
                lineId: "ui-only-id",
                description: "Teller extra",
                quantity: 24,
                unitNetCents: 125,
              },
            ],
          },
        },
      },
      "inq-1",
      null
    );

    expect(body.event.guest_count).toBe(12);
    expect(body.offer.persons).toBe(12);
    expect(body.charges_definition).toEqual({
      delivery: { amount_cents: 0 },
      dishware: {
        base_mode: "NONE",
        pauschale_per_person_cents: 200,
        additional_lines: [
          {
            description: "Teller extra",
            quantity: 24,
            unit_net_cents: 125,
          },
        ],
      },
      buffet: {
        base_mode: "PAUSCHALE",
        pauschale_per_person_cents: 75,
      },
      return_logistics: {
        mode: "NEXT_WORKING_DAY",
        pickup_window_text: null,
        same_day_fee_cents: 0,
      },
    });
    expect(JSON.stringify(body.charges_definition)).not.toContain("lineId");
    expect(JSON.stringify(body.charges_definition)).not.toContain("net_total_cents");
  });

  it("trims additional-line descriptions at the request boundary", () => {
    const definition = buildChargesDefinition({
      ...draft.chargesDefinition,
      dishware: {
        ...draft.chargesDefinition.dishware,
        additionalLines: [
          {
            lineId: "line-1",
            description: "  Gläser  ",
            quantity: 10,
            unitNetCents: 50,
          },
        ],
      },
    });
    expect(definition.dishware.additional_lines[0].description).toBe("Gläser");
  });
});

describe("canonical logistics timing in the Core snapshot payload", () => {
  it("sends exact delivery and event-start times without inventing a window end", () => {
    const body = buildOfferSnapshotRequest(
      {
        ...draft,
        orderContext: {
          ...draft.orderContext,
          eventStart: "18:00",
          deliveryTime: "16:30",
          // Legacy values may still exist in an old restored draft; an explicit
          // exact delivery time wins and must not manufacture/reuse a window.
          deliveryDate: "2026-08-20",
          deliveryWindowStart: "16:00",
          deliveryWindowEnd: "17:00",
        },
      },
      "inq-1",
      null
    );

    expect(body.event).toMatchObject({
      event_date: "2026-08-20",
      time_window_text: "18:00",
      event_start_local: "18:00",
      delivery_time_local: "16:30",
    });
    expect(body.event).not.toHaveProperty("delivery_date_local");
    expect(body.event).not.toHaveProperty("delivery_window_start_local");
    expect(body.event).not.toHaveProperty("delivery_window_end_local");
  });

  it("omits canonical delivery fields when no explicit structured window exists", () => {
    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    expect(body.event).not.toHaveProperty("delivery_date_local");
    expect(body.event.time_window_text).toBe("18:00");
  });

  it("sends an explicit canonical delivery window without parsing eventTime", () => {
    const body = buildOfferSnapshotRequest(
      {
        ...draft,
        orderContext: {
          ...draft.orderContext,
          eventTime: "abends",
          deliveryDate: "2026-08-20",
          deliveryWindowStart: "17:30",
          deliveryWindowEnd: "18:15",
        },
      },
      "inq-1",
      null
    );
    expect(body.event).toMatchObject({
      time_window_text: "abends",
      delivery_date_local: "2026-08-20",
      delivery_window_start_local: "17:30",
      delivery_window_end_local: "18:15",
    });
  });

  it("rejects a partial canonical delivery window", () => {
    expect(() =>
      buildOfferSnapshotRequest(
        {
          ...draft,
          orderContext: {
            ...draft.orderContext,
            deliveryDate: "2026-08-20",
            deliveryWindowStart: "17:30",
          },
        },
        "inq-1",
        null
      )
    ).toThrow("invalid_delivery_window");
  });

  it("sends canonical SAME_DAY pickup timing only when the explicit pair exists", () => {
    const definition = buildChargesDefinition({
      ...draft.chargesDefinition,
      returnLogistics: {
        mode: "SAME_DAY",
        pickupWindowText: "22:00–23:00",
        sameDayFeeCents: 2500,
        pickupWindowStartLocal: "22:00",
        pickupWindowEndLocal: "23:00",
      },
    });
    expect(definition.return_logistics).toEqual({
      mode: "SAME_DAY",
      pickup_window_text: "22:00–23:00",
      same_day_fee_cents: 2500,
      pickup_window_start_local: "22:00",
      pickup_window_end_local: "23:00",
    });
  });

  it("preserves the V2 return shape when SAME_DAY canonical pickup timing is unknown", () => {
    const definition = buildChargesDefinition({
      ...draft.chargesDefinition,
      returnLogistics: {
        mode: "SAME_DAY",
        pickupWindowText: "nach Veranstaltungsende",
        sameDayFeeCents: 2500,
      },
    });
    expect(definition.return_logistics).toEqual({
      mode: "SAME_DAY",
      pickup_window_text: "nach Veranstaltungsende",
      same_day_fee_cents: 2500,
    });
  });
});
