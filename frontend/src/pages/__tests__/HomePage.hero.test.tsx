/** Focused coverage for the Office-Panel-style Inquiry hero card's data
 * wiring: it must reflect the same handoff values already shown in
 * OrderContextCard (eventDate/location/persons) plus the eventType from
 * planning — with sane fallbacks — without deriving or persisting any new
 * business state (see HomePage's `heroTitle`/`heroFacts`, both purely
 * derived from existing state). */
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { HomePage } from "../HomePage";
import type { CatalogItem, InquiryToConfiguratorTransferV1 } from "../../types";

const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });

const testItem: CatalogItem = {
  id: "item-1",
  name: "Testartikel",
  section: "Test",
  category: "Test",
  subcategory: null,
  price: 12,
  price_type: "piece",
  min_order: 1,
  unit_label: "Stück",
  description: "",
  items_included: null,
  module: "food",
  source_type: "internal",
  item_kind: "simple",
  pricing_mode: "per_piece",
  customization_mode: "fixed",
};

let transfer: InquiryToConfiguratorTransferV1;

vi.mock("../../components/inquiry/InquiryIntake", () => ({
  InquiryIntake: ({
    onPrepareOffer,
  }: {
    onPrepareOffer: (transfer: InquiryToConfiguratorTransferV1) => void;
  }) => (
    <button type="button" onClick={() => onPrepareOffer(transfer)}>
      Zum Konfigurator (Test)
    </button>
  ),
}));

vi.mock("../../services/api", async () => {
  const actual = await vi.importActual<typeof import("../../services/api")>("../../services/api");
  return {
    ...actual,
    fetchItems: vi.fn(async () => [testItem]),
  };
});

async function renderConfigurator() {
  render(<HomePage />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Zum Konfigurator (Test)" }));
  });
  await screen.findByText("Testartikel");
}

describe("HomePage — Inquiry hero card wiring", () => {
  it("shows the event type as the hero title and date/location/persons as facts", async () => {
    transfer = {
      planning: {
        persons: 30,
        budget: null,
        budgetEnabled: false,
        desiredModules: [],
        dietaryRequirements: "",
        eventType: "Hochzeit",
        serviceStyle: "",
      },
      orderContextPrefill: {
        companyName: "",
        contactPerson: "Familie Schmidt",
        email: "",
        phone: "",
        eventDate: "2026-07-31",
        eventTime: "",
        location: "Brooksheide 3, 22549 Hamburg",
        billingAddress: "",
        remarks: "",
      },
    };
    await renderConfigurator();

    expect(screen.getByRole("heading", { name: "Hochzeit" })).toBeTruthy();
    expect(screen.getByText("31.07.2026")).toBeTruthy();
    expect(screen.getByText("Brooksheide 3, 22549 Hamburg")).toBeTruthy();
    expect(screen.getByText("ca. 30 Gäste")).toBeTruthy();
  });

  it("falls back to the company name, then a generic label, when eventType is blank", async () => {
    transfer = {
      planning: {
        persons: 10,
        budget: null,
        budgetEnabled: false,
        desiredModules: [],
        dietaryRequirements: "",
        eventType: "",
        serviceStyle: "",
      },
      orderContextPrefill: {
        companyName: "Musterfirma GmbH",
        contactPerson: "",
        email: "",
        phone: "",
        eventDate: "",
        eventTime: "",
        location: "",
        billingAddress: "",
        remarks: "",
      },
    };
    await renderConfigurator();

    expect(screen.getByRole("heading", { name: "Musterfirma GmbH" })).toBeTruthy();
  });

  it("falls back to a generic label when neither eventType nor company name are set", async () => {
    transfer = {
      planning: {
        persons: 10,
        budget: null,
        budgetEnabled: false,
        desiredModules: [],
        dietaryRequirements: "",
        eventType: "",
        serviceStyle: "",
      },
      orderContextPrefill: {
        companyName: "",
        contactPerson: "",
        email: "",
        phone: "",
        eventDate: "",
        eventTime: "",
        location: "",
        billingAddress: "",
        remarks: "",
      },
    };
    await renderConfigurator();

    expect(screen.getByRole("heading", { name: "Catering-Anfrage" })).toBeTruthy();
  });
});
