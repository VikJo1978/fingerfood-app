import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildBudgetDefinition,
  buildOfferSnapshotRequest,
  navigateToPreparedCoreOffer,
  parseOfferPrepareResponse,
  prepareAndNavigateToCoreOffer,
  prepareOfferErrorMessage,
  prepareOfferInCore,
} from "../offerSnapshotRequest";
import {
  CORE_INQUIRY_FRAGMENT_PREFIX,
  parseCoreInquiryHandoff,
} from "../coreInquiryHandoff";
import type { OfferDraft } from "../../types";

const draft = {
  persons: 10,
  budgetEnabled: false,
  totalBudget: 0,
  budgetType: "total",
  budgetBasis: "gross",
  budgetScope: "full_offer",
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

describe("prepareOfferInCore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(JSON.stringify(init)).not.toContain("FINGERFOOD_API_TOKEN");
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
    expect(() => parseOfferPrepareResponse(payload)).toThrow(
      "invalid_prepare_response"
    );
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
      vi.fn(async () =>
        new Response("snapshot customer@example.test secret-token", { status: 502 })
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

  it("does not navigate or announce success when preparation fails", async () => {
    const assign = vi.fn();
    const onPrepared = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("snapshot customer@example.test secret-token", { status: 502 })
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
    [
      "malformed UUID",
      () => Response.json({ ...validPrepareResponse, offer_id: "bad-id" }),
    ],
  ])(
    "does not navigate or announce success for a malformed 200 response: %s",
    async (_case, responseFactory) => {
      const assign = vi.fn();
      const onPrepared = vi.fn();
      vi.stubGlobal("fetch", vi.fn(async () => responseFactory()));

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
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(validPrepareResponse)));

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
    const handoff = parseCoreInquiryHandoff(
      `${CORE_INQUIRY_FRAGMENT_PREFIX}${encoded}`
    );
    expect(handoff).not.toBeNull();

    expect(buildOfferSnapshotRequest(draft, handoff!.inquiry_id, null).inquiry_id).toBe(
      inquiryId
    );
  });
});

describe("budget_definition in the Core snapshot payload", () => {
  it("is omitted entirely when budget tracking is disabled", () => {
    const body = buildOfferSnapshotRequest(
      { ...draft, budgetEnabled: false },
      "inq-1",
      null
    );
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
