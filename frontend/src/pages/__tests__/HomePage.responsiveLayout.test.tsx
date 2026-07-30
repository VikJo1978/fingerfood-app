/** Focused structural coverage for the two-column catalog/Offer-summary
 * layout after the visual alignment pass. jsdom doesn't compute real CSS
 * layout, so this checks the mobile-first contract at the class-token and
 * DOM-order level instead of pixel positions: the grid must default to a
 * single column and only switch to two columns from the `lg:` breakpoint up
 * (so on narrow screens the Offer summary naturally stacks below the
 * catalog, per the task's responsive requirement), and the summary
 * `<aside>` must follow the catalog in source order. */
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

describe("HomePage — catalog/summary responsive layout", () => {
  it("uses a mobile-first single-column grid that only splits into two columns from lg: up", async () => {
    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zum Konfigurator (Test)" }));
    });
    await screen.findByText("Testartikel");

    const aside = screen.getByRole("complementary");
    const grid = aside.parentElement;
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("grid");
    // No bare `grid-cols-*` at the base (mobile) breakpoint — only under `lg:`/`xl:`.
    expect(grid?.className).not.toMatch(/(?:^|\s)grid-cols-\d/);
    expect(grid?.className).toMatch(/lg:grid-cols-/);
  });

  it("places the Offer summary after the catalog in source order (so it stacks below on narrow screens)", async () => {
    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zum Konfigurator (Test)" }));
    });
    await screen.findByText("Testartikel");

    const aside = screen.getByRole("complementary");
    const grid = aside.parentElement as HTMLElement;
    const children = Array.from(grid.children);
    expect(children.indexOf(aside)).toBe(children.length - 1);
    expect(children[0].textContent).toContain("Angebotsbausteine auswählen");
  });
});
