/** Regression coverage for the missing Inquiry context in Angebotsvorschau
 * and the generated OfferSnapshot.
 *
 * Root cause: consumeCoreInquiryHandoff strips the "#core-inquiry=..."
 * fragment from the address bar the moment it's read (one-shot, by design —
 * see coreInquiryHandoff.ts). The resulting offerDraft/orderContext lived
 * only in React state with no backing persistence, so any remount of
 * HomePage in the same tab AFTER that first consumption (a reload, browser
 * back/forward, etc.) found nothing left to parse and silently reverted to
 * blank defaults — while catalog items could still be added normally, since
 * item-adding doesn't depend on orderContext at all. Angebotsvorschau then
 * rendered "—" for recipient/address/event date, and the generated
 * OfferSnapshot lost the same fields, even though the *first* load's
 * visible form had shown everything prefilled correctly.
 *
 * Fixed by persisting the consumed handoff to sessionStorage and restoring
 * it (revalidated with the same trust as a fresh fragment) when a later
 * mount finds no fragment in the URL.
 *
 * These tests exercise the real fragment -> visible form -> Angebotsvorschau
 * -> generated OfferSnapshot path end to end, not just the parser in
 * isolation. Fixture data is synthetic (not the real production Inquiry
 * that surfaced the bug), but matches the exact payload shape Core's
 * office_panel_offer_prefill.py produces. */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { HomePage } from "../HomePage";
import type { CatalogItem, InquiryToConfiguratorTransferV1 } from "../../types";

const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);

const testItem: CatalogItem = {
  id: "item-1",
  name: "Fingerfood Paket",
  section: "Test",
  category: "Test",
  subcategory: null,
  price: 8,
  price_type: "piece",
  min_order: 1,
  unit_label: "Stück",
  description: "Testartikel für die Regressionstests.",
  items_included: null,
  module: "food",
  source_type: "internal",
  item_kind: "simple",
  pricing_mode: "per_piece",
  customization_mode: "fixed",
};

const INQUIRY_ID = "99999999-9999-4999-8999-999999999999";
const INQUIRY_B_ID = "88888888-8888-4888-8888-888888888888";

const handoffTransfer: InquiryToConfiguratorTransferV1 = {
  planning: {
    persons: 30,
    budget: null,
    budgetEnabled: false,
    desiredModules: [],
    dietaryRequirements: "",
    eventType: "",
    serviceStyle: "",
  },
  orderContextPrefill: {
    companyName: "Musterfirma GmbH",
    contactPerson: "Erika Musterfrau",
    email: "erika@example.invalid",
    phone: "+49301234567",
    eventDate: "2026-07-31",
    eventTime: "12:25",
    location: "Musterstraße 1, 22549 Hamburg",
    billingAddress: "",
    remarks: "Betreff: Hochzeit",
  },
};

const handoffTransferWithFulfillment: InquiryToConfiguratorTransferV1 = {
  ...handoffTransfer,
  orderContextPrefill: {
    ...handoffTransfer.orderContextPrefill,
    billingAddress: "Rechnungsweg 7, 22549 Hamburg, DE",
  },
  fulfillmentPrefill: {
    fulfillmentMode: "DELIVERY",
    deliveryAddressMode: "SEPARATE",
    invoiceAddress: {
      street: "Rechnungsweg 7",
      postalCode: "22549",
      city: "Hamburg",
      country: "DE",
    },
    deliveryAddress: {
      street: "Festplatz 3",
      postalCode: "22765",
      city: "Hamburg",
      country: "DE",
    },
  },
};

const handoffTransferB: InquiryToConfiguratorTransferV1 = {
  planning: {
    persons: 12,
    budget: null,
    budgetEnabled: false,
    desiredModules: [],
    dietaryRequirements: "",
    eventType: "",
    serviceStyle: "",
  },
  orderContextPrefill: {
    companyName: "Zweitfirma AG",
    contactPerson: "Bernd Zweitfrau",
    email: "bernd@example.invalid",
    phone: "+49309876543",
    eventDate: "2026-09-15",
    eventTime: "19:00",
    location: "Zweitweg 2, 20095 Hamburg",
    billingAddress: "",
    remarks: "",
  },
};

function encodeFragment(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return "#core-inquiry=" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function handoffFragment(
  inquiryId: string = INQUIRY_ID,
  transfer: InquiryToConfiguratorTransferV1 = handoffTransfer
): string {
  return encodeFragment({
    schema_version: "core_inquiry_offer_prefill_v1",
    source: "silberloeffel-core",
    inquiry_id: inquiryId,
    transfer,
  });
}

vi.mock("../../services/api", async () => {
  const actual = await vi.importActual<typeof import("../../services/api")>("../../services/api");
  return { ...actual, fetchItems: vi.fn(async () => [testItem]) };
});

vi.mock("../../services/session", async () => {
  const actual =
    await vi.importActual<typeof import("../../services/session")>("../../services/session");
  return {
    ...actual,
    fetchUiSession: vi.fn(async () => ({
      status: "disabled" as const,
      state: {
        employee_auth_mode: "disabled" as const,
        authenticated: false,
        application_access_allowed: false,
        principal: null,
        csrf_token: null,
      },
    })),
  };
});

async function renderAfterHandoff() {
  window.location.hash = handoffFragment();
  render(<HomePage />);
  await act(async () => {});
  await screen.findByText("Fingerfood Paket");
}

function selectCompanyPayment(method: "VORKASSE" | "RECHNUNG" | "BAR_VOR_ORT" = "RECHNUNG") {
  fireEvent.change(screen.getByLabelText("Zahlungsart"), { target: { value: method } });
}

beforeEach(() => {
  vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Inquiry handoff context — visible form, Angebotsvorschau, OfferSnapshot", () => {
  it("prefills the visible order-context form from the fragment", async () => {
    await renderAfterHandoff();

    expect(screen.getByDisplayValue("Musterfirma GmbH")).toBeTruthy();
    expect(screen.getByDisplayValue("Erika Musterfrau")).toBeTruthy();
    expect(screen.getByDisplayValue("erika@example.invalid")).toBeTruthy();
    expect(screen.getByDisplayValue("+49301234567")).toBeTruthy();
    expect(screen.getByDisplayValue("2026-07-31")).toBeTruthy();
    expect(screen.getByDisplayValue("12:25")).toBeTruthy();
    expect(screen.getByDisplayValue("Musterstraße 1, 22549 Hamburg")).toBeTruthy();
  });

  it("prefills fulfillment and both addresses from Core instead of asking twice", async () => {
    window.location.hash = handoffFragment(INQUIRY_ID, handoffTransferWithFulfillment);
    render(<HomePage />);
    await act(async () => {});
    await screen.findByText("Fingerfood Paket");

    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);

    expect((screen.getByLabelText("Erfüllung") as HTMLSelectElement).value).toBe("DELIVERY");
    expect((screen.getByLabelText("Lieferadresse") as HTMLSelectElement).value).toBe("SEPARATE");
    expect(screen.getByDisplayValue("Rechnungsweg 7")).toBeTruthy();
    expect(screen.getByDisplayValue("22549")).toBeTruthy();
    expect(screen.getByDisplayValue("Festplatz 3")).toBeTruthy();
    expect(screen.getByDisplayValue("22765")).toBeTruthy();
  });

  it("defaults blank countries from a Core handoff to Germany", async () => {
    const transfer: InquiryToConfiguratorTransferV1 = {
      ...handoffTransferWithFulfillment,
      fulfillmentPrefill: {
        ...handoffTransferWithFulfillment.fulfillmentPrefill!,
        invoiceAddress: {
          ...handoffTransferWithFulfillment.fulfillmentPrefill!.invoiceAddress,
          country: "",
        },
        deliveryAddress: {
          ...handoffTransferWithFulfillment.fulfillmentPrefill!.deliveryAddress,
          country: "",
        },
      },
    };
    window.location.hash = handoffFragment(INQUIRY_ID, transfer);
    render(<HomePage />);
    await act(async () => {});
    await screen.findByText("Fingerfood Paket");

    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);

    const countries = screen.getAllByLabelText("Land") as HTMLSelectElement[];
    expect(countries).toHaveLength(2);
    expect(countries[0].value).toBe("DE");
    expect(countries[1].value).toBe("DE");
  });

  it("shows the same recipient, address, and event date/time in Angebotsvorschau", async () => {
    await renderAfterHandoff();

    fireEvent.click(screen.getByRole("button", { name: "Angebotsvorschau anzeigen" }));
    const dialog = screen.getByRole("dialog", { name: "Angebotsvorschau" });

    expect(within(dialog).getByText("Musterfirma GmbH")).toBeTruthy();
    expect(within(dialog).getByText("Erika Musterfrau")).toBeTruthy();
    expect(within(dialog).getByText("erika@example.invalid")).toBeTruthy();
    expect(within(dialog).getByText("+49301234567")).toBeTruthy();
    // Event date (31.07.2026), not the document creation date line.
    expect(within(dialog).getByText("31.07.2026")).toBeTruthy();
    // The imported legacy event time becomes the event start when it is a
    // canonical HH:MM value. It must not be duplicated as a made-up delivery time.
    expect(within(dialog).getByText("12:25", { exact: false })).toBeTruthy();
    expect(
      within(dialog).getByText(
        (_, element) => element?.textContent === "Musterstraße 1, 22549 Hamburg"
      )
    ).toBeTruthy();
    expect(
      within(dialog).queryByText(
        (_, element) => element?.textContent === "12:25, Musterstraße 1, 22549 Hamburg"
      )
    ).toBeNull();
    // Document creation date ("Hamburg, <today>") stays a separate line,
    // distinct from the event date assertion above.
    expect(within(dialog).getByText(/^Hamburg, \d{2}\.\d{2}\.\d{4}$/)).toBeTruthy();
    // No dash placeholders for the fields the bug showed as missing.
    expect(within(dialog).queryByText("—")).toBeNull();
  });

  it("blocks prepare locally while fulfillment is unresolved", async () => {
    await renderAfterHandoff();

    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    selectCompanyPayment();
    const fetchMock = vi.fn(async () =>
      Response.json({ offer_id: "11111111-1111-4111-8111-111111111111" }, { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Angebot in Core vorbereiten" }));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Bitte zuerst Lieferung oder Selbstabholung wählen.")).toBeTruthy();
  });

  it("blocks prepare until a payment method is selected", async () => {
    await renderAfterHandoff();

    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    fireEvent.change(screen.getByLabelText("Erfüllung"), { target: { value: "PICKUP" } });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    const fetchMock = vi.fn(async () =>
      Response.json({ offer_id: "11111111-1111-4111-8111-111111111111" }, { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Angebot in Core vorbereiten" }));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Bitte zuerst eine Zahlungsart auswählen.")).toBeTruthy();
  });

  it("carries recipient, address, and event date/time into the generated OfferSnapshot", async () => {
    await renderAfterHandoff();

    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    fireEvent.change(screen.getByLabelText("Erfüllung"), { target: { value: "PICKUP" } });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    selectCompanyPayment();

    // Capture the exact JSON body sent to the prepare-offer endpoint.
    let capturedBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return Response.json({ offer_id: "11111111-1111-4111-8111-111111111111" }, { status: 201 });
      })
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Angebot in Core vorbereiten" }));
    });

    expect(capturedBody).not.toBeNull();
    const body = capturedBody as unknown as {
      recipient: {
        company_name: string;
        contact_name: string;
        email: string;
        postal_address: string;
      };
      event: { event_date: string; time_window_text: string; location_text: string };
    };
    expect(body.recipient.company_name).toBe("Musterfirma GmbH");
    expect(body.recipient.contact_name).toBe("Erika Musterfrau");
    expect(body.recipient.email).toBe("erika@example.invalid");
    // No distinct billing address in the fixture, so the postal address
    // falls back to the event location per the existing contract.
    expect(body.recipient.postal_address).toBe("Musterstraße 1, 22549 Hamburg");
    expect(body.event.event_date).toBe("2026-07-31");
    expect(body.event.time_window_text).toBe("12:25");
    expect(body.event.location_text).toBe("Musterstraße 1, 22549 Hamburg");
  });

  it("survives a same-tab reload after the fragment was already consumed once", async () => {
    // First load: consumes the fragment, applies it, and (per the fix)
    // persists it so a later mount in the same tab can restore it.
    window.location.hash = handoffFragment();
    const initial = render(<HomePage />);
    await act(async () => {});
    expect(window.location.hash).toBe("");
    initial.unmount();

    // Second mount, same tab: the fragment is gone from the URL (already
    // consumed above), simulating a reload. Without the fix this reverts
    // to blank defaults; with the fix it restores from sessionStorage.
    render(<HomePage />);
    await act(async () => {});
    await screen.findByText("Fingerfood Paket");

    // Same Inquiry id (shown truncated in the imported-from-Core banner).
    expect(
      screen.getByText(`Aus Core-Anfrage ${INQUIRY_ID.slice(0, 8)} vorbefüllt.`, {
        exact: false,
      })
    ).toBeTruthy();
    // Company/contact/email/phone.
    expect(screen.getByDisplayValue("Musterfirma GmbH")).toBeTruthy();
    expect(screen.getByDisplayValue("Erika Musterfrau")).toBeTruthy();
    expect(screen.getByDisplayValue("erika@example.invalid")).toBeTruthy();
    expect(screen.getByDisplayValue("+49301234567")).toBeTruthy();
    // Address.
    expect(screen.getByDisplayValue("Musterstraße 1, 22549 Hamburg")).toBeTruthy();
    // Event date/time.
    expect(screen.getByDisplayValue("2026-07-31")).toBeTruthy();
    expect(screen.getByDisplayValue("12:25")).toBeTruthy();
    // Guest count — must be the real 30 from the handoff, not the static
    // default of 10 a lost/reset offerDraft would fall back to.
    expect(screen.getByDisplayValue("30")).toBeTruthy();
    // Remarks.
    expect(screen.getByDisplayValue("Betreff: Hochzeit")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Angebotsvorschau anzeigen" }));
    const dialog = screen.getByRole("dialog", { name: "Angebotsvorschau" });
    expect(within(dialog).getByText("Musterfirma GmbH")).toBeTruthy();
    expect(within(dialog).getByText("31.07.2026")).toBeTruthy();
    expect(within(dialog).getByText(/30 Personen/)).toBeTruthy();
  });

  it("still shows blank defaults on a first visit with no fragment and no prior session (no regression)", async () => {
    render(<HomePage />);
    await act(async () => {});

    // No handoff at all: page stays on the inquiry-intake landing screen,
    // exactly as before this fix — nothing to restore, nothing fabricated.
    expect(screen.queryByRole("button", { name: "Angebotsvorschau anzeigen" })).toBeNull();
  });

  it("does NOT restore a stale Inquiry when the tab is reused for a direct, non-handoff visit", async () => {
    // Consume Inquiry A's handoff and let it persist to sessionStorage.
    window.location.hash = handoffFragment();
    const first = render(<HomePage />);
    await act(async () => {});
    first.unmount();

    // A brand-new, direct navigation to the base URL in the same tab (no
    // fragment) creates a fresh history entry with no state of its own —
    // exactly like typing the URL, a bookmark, or opening a new tab that
    // happens to share sessionStorage. sessionStorage still has Inquiry A's
    // data, but nothing marks *this* entry as having consumed a handoff.
    window.history.replaceState(null, "", window.location.pathname);
    render(<HomePage />);
    await act(async () => {});

    // Must stay on the plain inquiry-intake landing screen, not silently
    // resume Inquiry A's company/contact/address for an unrelated visit.
    expect(screen.queryByRole("button", { name: "Angebotsvorschau anzeigen" })).toBeNull();
    expect(screen.queryByDisplayValue("Musterfirma GmbH")).toBeNull();
  });

  it("a fresh handoff for Inquiry B fully replaces Inquiry A, with no leftover fields", async () => {
    window.location.hash = handoffFragment(INQUIRY_ID, handoffTransfer);
    const first = render(<HomePage />);
    await act(async () => {});
    first.unmount();

    window.location.hash = handoffFragment(INQUIRY_B_ID, handoffTransferB);
    const second = render(<HomePage />);
    await act(async () => {});

    expect(screen.getByDisplayValue("Zweitfirma AG")).toBeTruthy();
    expect(screen.getByDisplayValue("Bernd Zweitfrau")).toBeTruthy();
    expect(screen.getByDisplayValue("2026-09-15")).toBeTruthy();
    expect(screen.queryByDisplayValue("Musterfirma GmbH")).toBeNull();
    expect(screen.queryByDisplayValue("Erika Musterfrau")).toBeNull();
    expect(screen.queryByDisplayValue("2026-07-31")).toBeNull();
    second.unmount();

    // A subsequent reload (fragment gone again) restores B, never A.
    render(<HomePage />);
    await act(async () => {});
    expect(screen.getByDisplayValue("Zweitfirma AG")).toBeTruthy();
    expect(screen.queryByDisplayValue("Musterfirma GmbH")).toBeNull();
  });

  it("discards a corrupted stored handoff on reload instead of partially populating the form", async () => {
    window.location.hash = handoffFragment();
    const first = render(<HomePage />);
    await act(async () => {});
    first.unmount();

    // Simulate storage corruption/tampering between page loads.
    window.sessionStorage.setItem(
      "fingerfood.core-inquiry-handoff.v1",
      '{"schema_version":"core_inquiry_offer_prefill_v1","source":"silberloeffel-core"'
    );

    render(<HomePage />);
    await act(async () => {});

    // No crash, and no partial data (e.g. from a half-parsed object) leaks
    // into the form — falls back to the plain intake landing screen.
    expect(screen.queryByRole("button", { name: "Angebotsvorschau anzeigen" })).toBeNull();
    expect(screen.queryByDisplayValue("Musterfirma GmbH")).toBeNull();
    // The corrupted entry is removed, not left to confuse a later reload.
    expect(window.sessionStorage.getItem("fingerfood.core-inquiry-handoff.v1")).toBeNull();
  });

  it("clears the stored handoff after a successful Offer preparation", async () => {
    await renderAfterHandoff();
    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    fireEvent.change(screen.getByLabelText("Erfüllung"), { target: { value: "PICKUP" } });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    selectCompanyPayment();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ offer_id: "11111111-1111-4111-8111-111111111111" }, { status: 201 })
      )
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Angebot in Core vorbereiten" }));
    });

    expect(window.sessionStorage.getItem("fingerfood.core-inquiry-handoff.v1")).toBeNull();
  });
});
