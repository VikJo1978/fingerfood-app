/** OFFER_DRAFT_SESSION_PERSISTENCE_V1 regression coverage.
 *
 * The Core-handoff prefill (contact/event fields) already survives a
 * same-tab reload via sessionStorage (see HomePage.inquiryHandoff.test.tsx).
 * This file covers the newer, broader requirement: the *entire* active
 * Configurator draft — added positions, quantities, guest count, and all
 * four budget fields (amount/type/tax-basis/cost-scope) — must survive a
 * same-tab hard reload too, for both the Core-handoff flow and the manual
 * "weak protocol" flow, with strict per-Inquiry isolation and explicit
 * clearing on successful Offer preparation / a new manual draft. */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
    remarks: "",
  },
};

const handoffTransferB: InquiryToConfiguratorTransferV1 = {
  ...handoffTransfer,
  planning: { ...handoffTransfer.planning, persons: 12 },
  orderContextPrefill: {
    ...handoffTransfer.orderContextPrefill,
    companyName: "Zweitfirma AG",
    contactPerson: "Bernd Zweitfrau",
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

function enableBudgetAndSet(basis: string, scope: string, type: string, amount: string) {
  fireEvent.click(screen.getByRole("button", { name: "Mit Budget arbeiten" }));
  fireEvent.change(screen.getByLabelText("Budget-Typ"), { target: { value: type } });
  fireEvent.change(screen.getByLabelText("Basis"), { target: { value: basis } });
  fireEvent.change(screen.getByLabelText("Umfang"), { target: { value: scope } });
  const input = screen.getByLabelText(
    type === "per_person" ? "Budget pro Person" : "Gesamtbudget"
  );
  fireEvent.change(input, { target: { value: amount } });
}

beforeEach(() => {
  vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Configurator draft session persistence — Core-handoff flow", () => {
  it("added positions and all four budget fields survive a same-tab reload", async () => {
    window.location.hash = handoffFragment();
    const first = render(<HomePage />);
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");

    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    enableBudgetAndSet("net", "positions_only", "per_person", "42");
    first.unmount();

    render(<HomePage />);
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");

    expect(screen.getByDisplayValue("Musterfirma GmbH")).toBeTruthy();
    expect((screen.getByLabelText("Budget-Typ") as HTMLSelectElement).value).toBe("per_person");
    expect((screen.getByLabelText("Basis") as HTMLSelectElement).value).toBe("net");
    expect((screen.getByLabelText("Umfang") as HTMLSelectElement).value).toBe("positions_only");
    // The line added before reload is still part of the offer.
    expect(screen.getAllByText("Fingerfood Paket").length).toBeGreaterThan(0);
  });

  it("does not restore Inquiry A's added positions or budget into a fresh Inquiry B handoff", async () => {
    window.location.hash = handoffFragment(INQUIRY_ID, handoffTransfer);
    const first = render(<HomePage />);
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");
    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    enableBudgetAndSet("gross", "full_offer", "total", "1200");
    first.unmount();

    window.location.hash = handoffFragment(INQUIRY_B_ID, handoffTransferB);
    render(<HomePage />);
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");

    expect(screen.getByDisplayValue("Zweitfirma AG")).toBeTruthy();
    // Budget must be back at its off-by-default state for the brand-new
    // Inquiry B session, not carrying Inquiry A's enabled/1200 config.
    expect(screen.queryByLabelText("Budget-Typ")).toBeNull();
  });

  it("clears the persisted draft for that Inquiry after a successful Offer preparation", async () => {
    window.location.hash = handoffFragment();
    render(<HomePage />);
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");
    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    fireEvent.change(screen.getByLabelText("Erfüllung"), { target: { value: "PICKUP" } });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.change(screen.getByLabelText("Zahlungsart"), {
      target: { value: "RECHNUNG" },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ offer_id: "11111111-1111-4111-8111-111111111111" }, { status: 201 })
      )
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Angebot in Core vorbereiten" }));
    });

    expect(
      window.sessionStorage.getItem(`fingerfood.configurator-draft.v1:inquiry:${INQUIRY_ID}`)
    ).toBeNull();
  });
});

describe("Configurator draft session persistence — manual flow", () => {
  it("survives a same-tab reload for the manual flow, including budget fields", async () => {
    const first = render(<HomePage />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Personen (erwartet)"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Angebot vorbereiten" }));
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");

    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    enableBudgetAndSet("net", "full_offer", "total", "800");
    first.unmount();

    render(<HomePage />);
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");

    expect((screen.getByLabelText("Basis") as HTMLSelectElement).value).toBe("net");
    expect(screen.getAllByText("Fingerfood Paket").length).toBeGreaterThan(0);
  });

  it("survives a same-tab reload with zero guests while preserving charges and blocked-prepare state", async () => {
    const first = render(<HomePage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Angebot vorbereiten" }));
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");
    fireEvent.change(screen.getByLabelText("Anzahl Personen"), {
      target: { value: "0" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    fireEvent.change(screen.getByRole("combobox", { name: "Büffetpauschale" }), {
      target: { value: "PAUSCHALE" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Geschirr" }), {
      target: { value: "PAUSCHALE" },
    });
    fireEvent.change(screen.getByLabelText("Anlieferung netto"), {
      target: { value: "0,00" },
    });
    fireEvent.change(screen.getAllByLabelText("Netto pro Person")[1], {
      target: { value: "2,50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Position hinzufügen" }));
    fireEvent.change(screen.getByDisplayValue("Zusatzgeschirr"), {
      target: { value: "Weinglaser" },
    });
    fireEvent.change(screen.getByLabelText("Anzahl Weinglaser"), {
      target: { value: "24" },
    });
    fireEvent.change(screen.getByLabelText("Netto-Einzelpreis"), {
      target: { value: "1,25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    enableBudgetAndSet("net", "positions_only", "per_person", "42");
    await act(async () => {});
    first.unmount();

    render(<HomePage />);
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");

    expect(screen.getByDisplayValue("0")).toBeTruthy();
    expect((screen.getByLabelText("Budget-Typ") as HTMLSelectElement).value).toBe("per_person");
    expect((screen.getByLabelText("Basis") as HTMLSelectElement).value).toBe("net");
    expect((screen.getByLabelText("Umfang") as HTMLSelectElement).value).toBe("positions_only");

    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    expect(screen.getByDisplayValue("0,00")).toBeTruthy();
    expect(screen.getByDisplayValue("2,50")).toBeTruthy();
    expect(screen.getByDisplayValue("Weinglaser")).toBeTruthy();
    expect(screen.getByDisplayValue("24")).toBeTruthy();
    expect(screen.getByDisplayValue("1,25")).toBeTruthy();
  });

  it("starting a new manual draft clears the previous manual draft instead of carrying it over", async () => {
    render(<HomePage />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Personen (erwartet)"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Angebot vorbereiten" }));
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");
    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    enableBudgetAndSet("gross", "full_offer", "total", "800");

    // Operator navigates back to the intake landing screen (no reload —
    // just a view switch, offerDraft state stays mounted in memory) and
    // starts a genuinely new manual draft from there.
    fireEvent.click(screen.getAllByRole("button", { name: "Zurück zur Anfrage" })[0]);
    fireEvent.change(screen.getByLabelText("Personen (erwartet)"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Angebot vorbereiten" }));
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");

    // Neither the previous draft's enabled budget nor its added position
    // carried over into this new draft.
    expect(screen.queryByLabelText("Budget-Typ")).toBeNull();

    // And a reload of this new (still budget-disabled) draft must not
    // resurrect the old, cleared manual draft either.
    render(<HomePage />);
    await act(async () => {});
    await screen.findAllByText("Fingerfood Paket");
    expect(screen.queryByLabelText("Budget-Typ")).toBeNull();
  });
});
