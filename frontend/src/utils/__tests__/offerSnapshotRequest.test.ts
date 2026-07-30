import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildOfferSnapshotRequest,
  navigateToPreparedCoreOffer,
  prepareAndNavigateToCoreOffer,
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
      Response.json({
        offer_id: "33333333-3333-4333-8333-333333333333",
        redirect_url: (
          "https://office.example.test/offer/"
          + "33333333-3333-4333-8333-333333333333"
        ),
      })
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

  it("navigates to the server-approved Core Offer Detail URL", () => {
    const assign = vi.fn();
    const result = {
      offer_id: "33333333-3333-4333-8333-333333333333",
      redirect_url: (
        "https://office.example.test/offer/"
        + "33333333-3333-4333-8333-333333333333"
      ),
    };

    navigateToPreparedCoreOffer(result, { assign });

    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(result.redirect_url);
  });

  it("shows a stable error without echoing Core response details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("snapshot customer@example.test secret-token", { status: 502 })
      )
    );

    const body = buildOfferSnapshotRequest(draft, "inq-1", null);
    await expect(prepareOfferInCore(body)).rejects.toThrow(
      "Angebot konnte nicht vorbereitet werden (502)."
    );
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
    ).rejects.toThrow("Angebot konnte nicht vorbereitet werden (502).");

    expect(assign).not.toHaveBeenCalled();
    expect(onPrepared).not.toHaveBeenCalled();
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
