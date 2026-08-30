import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderContextCard } from "../../components/OrderContextCard";
import {
  CORE_INQUIRY_FRAGMENT_PREFIX,
  CORE_INQUIRY_SESSION_KEY,
  clearStoredCoreInquiryHandoff,
  consumeCoreInquiryHandoff,
  parseCoreInquiryHandoff,
  readCoreInquiryHandoffHistoryMarker,
  readStoredCoreInquiryHandoff,
  storeCoreInquiryHandoff,
} from "../coreInquiryHandoff";

/** In-memory Storage stand-in so these lifecycle tests don't depend on
 * jsdom's sessionStorage or any HomePage rendering. */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function validEnvelope() {
  return {
    schema_version: "core_inquiry_offer_prefill_v1",
    source: "silberloeffel-core",
    inquiry_id: "11111111-1111-1111-1111-111111111111",
    transfer: {
      planning: {
        persons: null,
        budget: null,
        budgetEnabled: false,
        desiredModules: [],
        dietaryRequirements: "",
        eventType: "Jubiläum",
        serviceStyle: "",
      },
      orderContextPrefill: {
        companyName: "Möbel & Mehr GmbH",
        contactPerson: "Jörg Weiß",
        email: "joerg@example.test",
        phone: "040 12345",
        eventDate: "2026-10-03",
        eventTime: "18:30–23:00",
        location: "Große Bleichen 1, Hamburg",
        billingAddress: "",
        remarks: "Wunsch: vegetarisch",
      },
    },
  };
}

describe("Core Inquiry handoff", () => {
  it("preserves every contact and event field through parsing and visible form state", () => {
    const parsed = parseCoreInquiryHandoff(
      `${CORE_INQUIRY_FRAGMENT_PREFIX}${encode(validEnvelope())}`
    );

    expect(parsed?.transfer.planning.persons).toBeNull();
    expect(parsed?.transfer.orderContextPrefill).toEqual({
      companyName: "Möbel & Mehr GmbH",
      contactPerson: "Jörg Weiß",
      email: "joerg@example.test",
      phone: "040 12345",
      eventDate: "2026-10-03",
      eventTime: "18:30–23:00",
      location: "Große Bleichen 1, Hamburg",
      billingAddress: "",
      remarks: "Wunsch: vegetarisch",
    });

    const visibleForm = renderToStaticMarkup(
      createElement(OrderContextCard, {
        orderContext: parsed!.transfer.orderContextPrefill,
        onOrderContextChange: () => undefined,
        onPaymentMethodChange: () => undefined,
      })
    );
    expect(visibleForm).toContain('value="Möbel &amp; Mehr GmbH"');
    expect(visibleForm).toContain('value="Jörg Weiß"');
    expect(visibleForm).toContain('value="joerg@example.test"');
    expect(visibleForm).toContain('value="040 12345"');
    expect(visibleForm).toContain('value="2026-10-03"');
    expect(visibleForm).toContain('value="18:30–23:00"');
    expect(visibleForm).toContain('value="Große Bleichen 1, Hamburg"');
    expect(visibleForm).toContain("Wunsch: vegetarisch");
  });

  it.each([
    ["without missing padding", "x", 0],
    ["with one missing padding character", "", 3],
    ["with two missing padding characters", "xx", 2],
  ])("decodes unpadded base64url %s", (_case, remarks, expectedRemainder) => {
    const envelope = validEnvelope();
    envelope.transfer.orderContextPrefill.remarks = remarks;
    const encoded = encode(envelope);
    expect(encoded.length % 4).toBe(expectedRemainder);

    const parsed = parseCoreInquiryHandoff(`${CORE_INQUIRY_FRAGMENT_PREFIX}${encoded}`);
    expect(parsed?.inquiry_id).toBe(envelope.inquiry_id);
    expect(parsed?.transfer.orderContextPrefill.remarks).toBe(remarks);
  });

  it("decodes the URL-safe alphabet", () => {
    const envelope = validEnvelope();
    envelope.transfer.orderContextPrefill.remarks = "¾ ";
    const encoded = encode(envelope);
    expect(encoded).toContain("-");
    expect(encoded).toContain("_");

    expect(
      parseCoreInquiryHandoff(`${CORE_INQUIRY_FRAGMENT_PREFIX}${encoded}`)?.transfer
        .orderContextPrefill.remarks
    ).toBe("¾ ");
  });

  it("rejects a wrong schema, bad types and malformed base64url", () => {
    expect(
      parseCoreInquiryHandoff(
        `${CORE_INQUIRY_FRAGMENT_PREFIX}${encode({
          ...validEnvelope(),
          schema_version: "future-v2",
        })}`
      )
    ).toBeNull();
    const invalidPersons = validEnvelope();
    (invalidPersons.transfer.planning as { persons: number | null }).persons = 0;
    expect(
      parseCoreInquiryHandoff(`${CORE_INQUIRY_FRAGMENT_PREFIX}${encode(invalidPersons)}`)
    ).toBeNull();
    const invalidDate = validEnvelope();
    invalidDate.transfer.orderContextPrefill.eventDate = "2026-02-30";
    expect(
      parseCoreInquiryHandoff(`${CORE_INQUIRY_FRAGMENT_PREFIX}${encode(invalidDate)}`)
    ).toBeNull();
    expect(parseCoreInquiryHandoff(`${CORE_INQUIRY_FRAGMENT_PREFIX}***`)).toBeNull();
    expect(parseCoreInquiryHandoff(`${CORE_INQUIRY_FRAGMENT_PREFIX}A`)).toBeNull();
  });

  it("rejects oversized fragments before decoding", () => {
    expect(
      parseCoreInquiryHandoff(`${CORE_INQUIRY_FRAGMENT_PREFIX}${"a".repeat(16_001)}`)
    ).toBeNull();
  });

  it("clears a recognized fragment immediately, including malformed data", () => {
    const calls: unknown[][] = [];
    const result = consumeCoreInquiryHandoff(
      { hash: `${CORE_INQUIRY_FRAGMENT_PREFIX}***`, pathname: "/angebot", search: "?lang=de" },
      { replaceState: (...args: unknown[]) => calls.push(args) } as Pick<History, "replaceState">
    );
    expect(result).toEqual({ present: true, handoff: null });
    expect(calls).toEqual([[null, "", "/angebot?lang=de"]]);
  });

  it("writes a history.state marker containing only the schema and inquiry id — no contact data", () => {
    const calls: unknown[][] = [];
    const envelope = validEnvelope();
    consumeCoreInquiryHandoff(
      {
        hash: `${CORE_INQUIRY_FRAGMENT_PREFIX}${encode(envelope)}`,
        pathname: "/angebot",
        search: "",
      },
      { replaceState: (...args: unknown[]) => calls.push(args) } as Pick<History, "replaceState">
    );
    expect(calls).toEqual([
      [
        { schema_version: "core_inquiry_offer_prefill_v1", inquiry_id: envelope.inquiry_id },
        "",
        "/angebot",
      ],
    ]);
  });
});

describe("Core Inquiry handoff — sessionStorage lifecycle", () => {
  const handoff = {
    schema_version: "core_inquiry_offer_prefill_v1" as const,
    source: "silberloeffel-core" as const,
    inquiry_id: "11111111-1111-1111-1111-111111111111",
    transfer: validEnvelope().transfer,
  };

  it("reads back exactly what was stored when the marker's inquiry id matches", () => {
    const storage = fakeStorage();
    storeCoreInquiryHandoff(handoff, storage);
    expect(readStoredCoreInquiryHandoff(handoff.inquiry_id, storage)).toEqual(handoff);
  });

  it("stores only the approved prefill shape — no token, credential, or priced Offer fields", () => {
    const storage = fakeStorage();
    storeCoreInquiryHandoff(handoff, storage);
    const raw = storage.getItem(CORE_INQUIRY_SESSION_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(Object.keys(parsed).sort()).toEqual(
      ["inquiry_id", "schema_version", "source", "transfer"].sort()
    );
    expect(raw).not.toMatch(/bearer/i);
    expect(raw).not.toMatch(/token/i);
    expect(raw).not.toMatch(/api[_-]?key/i);
    expect(raw).not.toMatch(/offer_id/i);
    expect(raw).not.toMatch(/net_total_cents|unit_net_cents|vat_/i);
  });

  it("ignores and removes a stored handoff for a different inquiry id than the marker", () => {
    const storage = fakeStorage();
    storeCoreInquiryHandoff(handoff, storage);
    expect(
      readStoredCoreInquiryHandoff("22222222-2222-2222-2222-222222222222", storage)
    ).toBeNull();
    expect(storage.getItem(CORE_INQUIRY_SESSION_KEY)).toBeNull();
  });

  it("ignores and removes malformed JSON", () => {
    const storage = fakeStorage();
    storage.setItem(CORE_INQUIRY_SESSION_KEY, "{not json");
    expect(readStoredCoreInquiryHandoff(handoff.inquiry_id, storage)).toBeNull();
    expect(storage.getItem(CORE_INQUIRY_SESSION_KEY)).toBeNull();
  });

  it("ignores and removes a well-formed but schema-invalid payload", () => {
    const storage = fakeStorage();
    storage.setItem(
      CORE_INQUIRY_SESSION_KEY,
      JSON.stringify({ ...handoff, schema_version: "obsolete-v0" })
    );
    expect(readStoredCoreInquiryHandoff(handoff.inquiry_id, storage)).toBeNull();
    expect(storage.getItem(CORE_INQUIRY_SESSION_KEY)).toBeNull();
  });

  it("returns null without touching storage when nothing is stored", () => {
    const storage = fakeStorage();
    expect(readStoredCoreInquiryHandoff(handoff.inquiry_id, storage)).toBeNull();
  });

  it("clearStoredCoreInquiryHandoff removes the entry outright", () => {
    const storage = fakeStorage();
    storeCoreInquiryHandoff(handoff, storage);
    clearStoredCoreInquiryHandoff(storage);
    expect(storage.getItem(CORE_INQUIRY_SESSION_KEY)).toBeNull();
  });

  it("a fresh handoff for a different inquiry fully overwrites the previous one", () => {
    const storage = fakeStorage();
    storeCoreInquiryHandoff(handoff, storage);
    const handoffB = { ...handoff, inquiry_id: "33333333-3333-3333-3333-333333333333" };
    storeCoreInquiryHandoff(handoffB, storage);
    expect(readStoredCoreInquiryHandoff(handoffB.inquiry_id, storage)).toEqual(handoffB);
    // The old inquiry id is no longer readable at all — not merely shadowed.
    expect(readStoredCoreInquiryHandoff(handoff.inquiry_id, storage)).toBeNull();
  });

  it("readCoreInquiryHandoffHistoryMarker only recognizes a well-formed marker", () => {
    expect(
      readCoreInquiryHandoffHistoryMarker({
        state: { schema_version: "core_inquiry_offer_prefill_v1", inquiry_id: "x" },
      })
    ).toEqual({ schema_version: "core_inquiry_offer_prefill_v1", inquiry_id: "x" });
    expect(readCoreInquiryHandoffHistoryMarker({ state: null })).toBeNull();
    expect(readCoreInquiryHandoffHistoryMarker({ state: {} })).toBeNull();
    expect(
      readCoreInquiryHandoffHistoryMarker({ state: { schema_version: "wrong", inquiry_id: "x" } })
    ).toBeNull();
  });
});
