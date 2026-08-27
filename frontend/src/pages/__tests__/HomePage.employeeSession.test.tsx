import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  description: "Testartikel für Session-Guard-Tests.",
  items_included: null,
  module: "food",
  source_type: "internal",
  item_kind: "simple",
  pricing_mode: "per_piece",
  customization_mode: "fixed",
};

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

const fetchUiSessionMock = vi.fn();
const exchangeCoreHandoffMock = vi.fn();
const prepareAndNavigateToCoreOfferMock = vi.fn();
const consumeCoreInquiryHandoffMock = vi.fn();

const disabledSessionResult = {
  status: "disabled" as const,
  state: {
    employee_auth_mode: "disabled" as const,
    authenticated: false,
    application_access_allowed: false,
    principal: null,
    csrf_token: null,
  },
};

const authenticatedSessionResult = {
  status: "authenticated" as const,
  state: {
    employee_auth_mode: "employee" as const,
    authenticated: true,
    application_access_allowed: true,
    principal: {
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "super.admin",
      display_name: "Super Admin",
      role: "SUPERADMIN",
    },
    csrf_token: "csrf-test-token",
  },
};

vi.mock("../../services/api", async () => {
  const actual = await vi.importActual<typeof import("../../services/api")>("../../services/api");
  return { ...actual, fetchItems: vi.fn(async () => [testItem]) };
});

vi.mock("../../services/session", async () => {
  const actual =
    await vi.importActual<typeof import("../../services/session")>("../../services/session");
  return { ...actual, fetchUiSession: (...args: []) => fetchUiSessionMock(...args) };
});

vi.mock("../../services/handoff", () => ({
  exchangeCoreHandoff: (...args: unknown[]) => exchangeCoreHandoffMock(...args),
}));

vi.mock("../../utils/coreInquiryHandoff", async () => {
  const actual = await vi.importActual<typeof import("../../utils/coreInquiryHandoff")>(
    "../../utils/coreInquiryHandoff"
  );
  return {
    ...actual,
    consumeCoreInquiryHandoff: (...args: unknown[]) => consumeCoreInquiryHandoffMock(...args),
  };
});

vi.mock("../../utils/offerSnapshotRequest", async () => {
  const actual = await vi.importActual<typeof import("../../utils/offerSnapshotRequest")>(
    "../../utils/offerSnapshotRequest"
  );
  return {
    ...actual,
    prepareAndNavigateToCoreOffer: (...args: unknown[]) =>
      prepareAndNavigateToCoreOfferMock(...args),
  };
});

async function renderHomePage() {
  render(<HomePage />);
  await act(async () => {});
}

async function renderPreparedPage() {
  await renderHomePage();
  await screen.findByText("Fingerfood Paket");
  fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
  fireEvent.change(screen.getByLabelText("Erfüllung"), { target: { value: "PICKUP" } });
  fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
}

describe("HomePage employee-session gating", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });
    fetchUiSessionMock.mockReset();
    fetchUiSessionMock.mockResolvedValue(disabledSessionResult);
    exchangeCoreHandoffMock.mockReset();
    prepareAndNavigateToCoreOfferMock.mockReset();
    consumeCoreInquiryHandoffMock.mockReset();
    consumeCoreInquiryHandoffMock.mockReturnValue({ present: false, handoff: null });
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
  });

  it("keeps prepare hidden while session bootstrap is still loading", async () => {
    fetchUiSessionMock.mockImplementation(() => new Promise(() => {}));
    await renderHomePage();
    expect(screen.queryByRole("button", { name: "Angebot in Core vorbereiten" })).toBeNull();
    expect(prepareAndNavigateToCoreOfferMock).not.toHaveBeenCalled();
  });

  it("keeps prepare disabled when employee-mode bootstrap fails", async () => {
    fetchUiSessionMock.mockResolvedValueOnce({
      status: "unavailable",
      state: null,
    });
    await renderHomePage();
    expect(screen.queryByRole("button", { name: "Angebot in Core vorbereiten" })).toBeNull();
    expect(prepareAndNavigateToCoreOfferMock).not.toHaveBeenCalled();
  });

  it("keeps legacy prepare behavior enabled when backend reports disabled mode", async () => {
    fetchUiSessionMock.mockResolvedValueOnce(disabledSessionResult);
    consumeCoreInquiryHandoffMock.mockReturnValue({
      present: true,
      handoff: {
        schema_version: "core_inquiry_offer_prefill_v1" as const,
        inquiry_id: "99999999-9999-4999-8999-999999999999",
        transfer: handoffTransfer,
      },
    });
    window.history.replaceState(null, "", "/#core-inquiry=test");
    await renderPreparedPage();
    expect(screen.getByRole("button", { name: "Angebot in Core vorbereiten" })).not.toBeNull();
    expect(prepareAndNavigateToCoreOfferMock).not.toHaveBeenCalled();
  });

  it("exchanges core-handoff successfully, strips the code from the URL, and prepares with context_id only", async () => {
    fetchUiSessionMock.mockResolvedValueOnce(authenticatedSessionResult);
    exchangeCoreHandoffMock.mockResolvedValueOnce({
      context_id: "trusted-context-1",
      operation: "prepare_first_offer",
      transfer: handoffTransfer,
      expires_at: "2026-08-04T10:15:00+00:00",
    });
    prepareAndNavigateToCoreOfferMock.mockResolvedValueOnce({
      offer_id: "33333333-3333-4333-8333-333333333333",
    });
    window.history.replaceState(null, "", "/#core-handoff=opaqueCode123");

    await renderPreparedPage();

    await waitFor(() => {
      expect(exchangeCoreHandoffMock).toHaveBeenCalledWith("opaqueCode123");
    });
    expect(window.location.hash).toBe("");
    expect(screen.getByDisplayValue("Musterfirma GmbH")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Angebot in Core vorbereiten" }));

    await waitFor(() => {
      expect(prepareAndNavigateToCoreOfferMock).toHaveBeenCalledOnce();
    });
    const [body] = prepareAndNavigateToCoreOfferMock.mock.calls[0];
    expect(body).toMatchObject({
      context_id: "trusted-context-1",
      recipient: { company_name: "Musterfirma GmbH" },
    });
    expect(body).not.toHaveProperty("inquiry_id");
  });

  it("keeps prepare disabled when handoff exchange fails", async () => {
    fetchUiSessionMock.mockResolvedValueOnce(authenticatedSessionResult);
    exchangeCoreHandoffMock.mockRejectedValueOnce(new Error("handoff_exchange_failed"));
    window.history.replaceState(null, "", "/#core-handoff=opaqueCode123");

    await renderHomePage();

    expect(
      await screen.findByText(
        "Core-Handoff konnte nicht bestätigt werden. Angebotsvorbereitung bleibt deaktiviert."
      )
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Angebot in Core vorbereiten" })).toBeNull();
    expect(prepareAndNavigateToCoreOfferMock).not.toHaveBeenCalled();
  });

  it("rejects unsigned core-inquiry in employee mode", async () => {
    fetchUiSessionMock.mockResolvedValueOnce(authenticatedSessionResult);
    window.history.replaceState(null, "", "/#core-inquiry=legacyPayload");

    await renderHomePage();

    expect(
      await screen.findByText("Unsigned Core-Handoff wird im Mitarbeiter-Modus abgewiesen.")
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Angebot in Core vorbereiten" })).toBeNull();
    expect(exchangeCoreHandoffMock).not.toHaveBeenCalled();
  });
});
