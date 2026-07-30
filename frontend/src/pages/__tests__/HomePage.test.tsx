/** Regression coverage for the "Zum Angebot hinzufügen" crash: production is
 * served over plain HTTP via Tailscale (not a secure context), so
 * `crypto.randomUUID` is withheld by the browser. Clicking the button used
 * to call it directly and throw, dropping the click with no item added and
 * the total stuck at 0,00 EUR. These tests exercise the real `HomePage` +
 * `ItemCard` click path, not just the isolated `generateUuidV4` helper. */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { HomePage } from "../HomePage";
import type { CatalogItem, InquiryToConfiguratorTransferV1 } from "../../types";

const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);

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
  description: "Ein Testartikel für die Regressionstests.",
  items_included: null,
  module: "food",
  source_type: "internal",
  item_kind: "simple",
  pricing_mode: "per_piece",
  customization_mode: "fixed",
};

const testTransfer: InquiryToConfiguratorTransferV1 = {
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
    companyName: "Test GmbH",
    contactPerson: "Test Contact",
    email: "test@example.invalid",
    phone: "",
    eventDate: "2026-09-01",
    eventTime: "18:00",
    location: "Hamburg",
    billingAddress: "",
    remarks: "",
  },
};

// InquiryIntake's own form flow isn't the code under test; this stub calls
// the real onPrepareOffer prop synchronously, driving HomePage's real
// handlePrepareOffer/state so the item grid — and the real onAddLine — mount.
vi.mock("../../components/inquiry/InquiryIntake", () => ({
  InquiryIntake: ({
    onPrepareOffer,
  }: {
    onPrepareOffer: (transfer: InquiryToConfiguratorTransferV1) => void;
  }) => (
    <button type="button" onClick={() => onPrepareOffer(testTransfer)}>
      Zum Konfigurator (Test)
    </button>
  ),
}));

vi.mock("../../services/api", async () => {
  const actual = await vi.importActual<typeof import("../../services/api")>(
    "../../services/api"
  );
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
  // Catalog fetch resolves asynchronously (mocked fetchItems is still a Promise).
  await screen.findByText("Testartikel");
}

function offerSummary(): HTMLElement {
  return screen.getByRole("complementary");
}

function positionenTotalText(): string | null {
  const label = within(offerSummary()).getByText("Positionen");
  return label.nextElementSibling?.textContent ?? null;
}

describe("HomePage — add item to offer", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("adds exactly one item and updates the total when crypto.randomUUID is unavailable", async () => {
    // Simulates the production failure precondition: no native randomUUID.
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });
    await renderConfigurator();

    expect(
      screen.getByText("Noch keine Positionen. Wählen Sie links Artikel aus und fügen Sie sie hinzu.")
    ).toBeTruthy();
    const totalBefore = positionenTotalText();

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    }).not.toThrow();

    expect(
      screen.queryByText("Noch keine Positionen. Wählen Sie links Artikel aus und fügen Sie sie hinzu.")
    ).toBeNull();
    expect(within(offerSummary()).getAllByRole("listitem")).toHaveLength(1);
    expect(positionenTotalText()).not.toBe(totalBefore);
  });

  it("still adds exactly one item when crypto.randomUUID is natively available", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "33333333-3333-4333-8333-333333333333",
      getRandomValues: realGetRandomValues,
    });
    await renderConfigurator();

    fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));

    expect(within(offerSummary()).getAllByRole("listitem")).toHaveLength(1);
  });

  it("generates distinct line IDs so repeated clicks add separate lines, not replace one", async () => {
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });
    await renderConfigurator();

    const addButton = screen.getByRole("button", { name: "Zum Angebot hinzufügen" });
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    expect(within(offerSummary()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows a fixed message, not raw exception text, when no secure random source exists at all", async () => {
    await renderConfigurator();
    // Only stub after the catalog has rendered — simulates random bytes
    // becoming unavailable at click time, isolated from the render/fetch path.
    vi.stubGlobal("crypto", {});

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "Zum Angebot hinzufügen" }));
    }).not.toThrow();

    expect(within(offerSummary()).queryAllByRole("listitem")).toHaveLength(0);
    const message = screen.getByText(
      "Position konnte nicht hinzugefügt werden: kein sicherer Zufallsgenerator verfügbar."
    );
    expect(message.textContent).not.toContain("UuidGenerationError");
    expect(message.textContent).not.toContain("uuid_generation_unavailable");
  });
});
