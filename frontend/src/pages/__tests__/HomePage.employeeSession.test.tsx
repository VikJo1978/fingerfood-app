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

vi.mock("../../services/api", async () => {
  const actual = await vi.importActual<typeof import("../../services/api")>(
    "../../services/api"
  );
  return { ...actual, fetchItems: vi.fn(async () => [testItem]) };
});

const fetchUiSessionMock = vi.fn();
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

vi.mock("../../services/session", async () => {
  const actual = await vi.importActual<typeof import("../../services/session")>(
    "../../services/session"
  );
  return { ...actual, fetchUiSession: (...args: []) => fetchUiSessionMock(...args) };
});

vi.mock("../../utils/coreInquiryHandoff", async () => {
  const actual = await vi.importActual<typeof import("../../utils/coreInquiryHandoff")>(
    "../../utils/coreInquiryHandoff"
  );
  return {
    ...actual,
    consumeCoreInquiryHandoff: () => ({
      present: true,
      handoff: {
        schema_version: "core_inquiry_offer_prefill_v1" as const,
        inquiry_id: "99999999-9999-4999-8999-999999999999",
        transfer: handoffTransfer,
      },
    }),
  };
});

const prepareAndNavigateToCoreOfferMock = vi.fn();

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

async function renderPreparedPage() {
  render(<HomePage />);
  await act(async () => {});
  await screen.findByText("Fingerfood Paket");
  fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
}

describe("HomePage employee-session gating", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });
    fetchUiSessionMock.mockReset();
    fetchUiSessionMock.mockResolvedValue(disabledSessionResult);
    prepareAndNavigateToCoreOfferMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps prepare hidden while session bootstrap is still loading", async () => {
    fetchUiSessionMock.mockImplementation(() => new Promise(() => {}));
    await renderPreparedPage();
    expect(screen.queryByRole("button", { name: "Angebot in Core vorbereiten" })).toBeNull();
    expect(prepareAndNavigateToCoreOfferMock).not.toHaveBeenCalled();
  });

  it("keeps prepare disabled when employee-mode bootstrap fails", async () => {
    fetchUiSessionMock.mockResolvedValueOnce({
      status: "unavailable",
      state: null,
    });
    await renderPreparedPage();
    expect(screen.queryByRole("button", { name: "Angebot in Core vorbereiten" })).toBeNull();
    expect(
      await screen.findByText("Core-Mitarbeiterauthentifizierung ist derzeit nicht erreichbar.")
    ).not.toBeNull();
    expect(prepareAndNavigateToCoreOfferMock).not.toHaveBeenCalled();
  });

  it("keeps legacy prepare behavior enabled when backend reports disabled mode", async () => {
    fetchUiSessionMock.mockResolvedValueOnce(disabledSessionResult);
    await renderPreparedPage();
    expect(screen.getByRole("button", { name: "Angebot in Core vorbereiten" })).not.toBeNull();
    expect(prepareAndNavigateToCoreOfferMock).not.toHaveBeenCalled();
  });
});
