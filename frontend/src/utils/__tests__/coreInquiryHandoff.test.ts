import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderContextCard } from "../../components/OrderContextCard";
import {
  CORE_INQUIRY_FRAGMENT_PREFIX,
  consumeCoreInquiryHandoff,
  parseCoreInquiryHandoff,
} from "../coreInquiryHandoff";

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
});
