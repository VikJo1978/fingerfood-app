import { describe, expect, it, vi, afterEach } from "vitest";
import { buildOfferSnapshotRequest, prepareOfferInCore } from "../offerSnapshotRequest";
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
        offer_id: "offer-1",
        offer_version_id: "ver-1",
        snapshot_id: "snap-1",
        schema_version: "offer_snapshot_v2",
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
