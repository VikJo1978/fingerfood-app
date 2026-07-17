import { describe, expect, it, vi, afterEach } from "vitest";
import { buildOfferSnapshotRequest, prepareOfferInCore } from "../offerSnapshotRequest";
import type { OfferDraft } from "../../types";

const draft = {
  persons: 10,
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
} as OfferDraft;

describe("prepareOfferInCore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the UI BFF route without Authorization header", async () => {
    const fetchMock = vi.fn(async () =>
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
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/ui/offer/prepare");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.stringify(init)).not.toContain("FINGERFOOD_API_TOKEN");
  });
});
