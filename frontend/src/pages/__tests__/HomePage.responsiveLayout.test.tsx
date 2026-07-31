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

    // OfferSummary's <aside> sits inside a right-column wrapper, which is
    // itself the second child of the two-column grid.
    const aside = screen.getByRole("complementary");
    const rightColumn = aside.parentElement;
    const grid = rightColumn?.parentElement;
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("grid");
    // No bare `grid-cols-*` at the base (mobile) breakpoint — only under `lg:`/`xl:`.
    expect(grid?.className).not.toMatch(/(?:^|\s)grid-cols-\d/);
    expect(grid?.className).toMatch(/lg:grid-cols-/);
  });

  it("places the Offer summary's column after the catalog column in source order (so it stacks below on narrow screens)", async () => {
    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zum Konfigurator (Test)" }));
    });
    await screen.findByText("Testartikel");

    const aside = screen.getByRole("complementary");
    const rightColumn = aside.parentElement as HTMLElement;
    const grid = rightColumn.parentElement as HTMLElement;
    const children = Array.from(grid.children);
    expect(children.indexOf(rightColumn)).toBe(children.length - 1);
    expect(children[0].textContent).toContain("Angebotsbausteine auswählen");
  });

  /** OFFER_PANE_DESKTOP_TOP_ALIGNMENT_V1 regression coverage: the Inquiry
   * hero/context stack previously sat full-width *above* the two-column
   * grid, so it pushed both columns — including the sticky Offer pane —
   * down by its own height before the sticky column ever got a chance to
   * pin. At 1440x900/scrollY=0 that left both final action buttons below
   * the fold. jsdom can't measure real pixel layout, so this asserts the
   * structural fix instead: the hero card must live *inside* the left
   * column of the same grid the Offer pane's column belongs to, not in a
   * sibling that precedes the grid. */
  it("keeps the Inquiry hero card inside the left column of the same grid as the Offer pane (not nested above it)", async () => {
    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zum Konfigurator (Test)" }));
    });
    await screen.findByText("Testartikel");

    const aside = screen.getByRole("complementary");
    const rightColumn = aside.parentElement as HTMLElement;
    const grid = rightColumn.parentElement as HTMLElement;
    const leftColumn = grid.children[0] as HTMLElement;

    const heroHeading = screen.getByRole("heading", { level: 1 });
    // The hero heading's nearest grid ancestor must be the *left column*
    // of the very same two-column grid the Offer pane's column belongs to
    // — proving the hero is a sibling-in-a-column, not a full-width block
    // stacked above the grid that would push the sticky column down.
    expect(leftColumn.contains(heroHeading)).toBe(true);
    expect(grid.contains(heroHeading)).toBe(true);

    // No full-width sibling precedes the grid within the page content
    // wrapper: whatever comes before the grid (if anything) must contain
    // no heading of its own — a full-width hero/context block would.
    const gridParent = grid.parentElement as HTMLElement;
    const gridIndex = Array.from(gridParent.children).indexOf(grid);
    for (let i = 0; i < gridIndex; i++) {
      const preceding = gridParent.children[i] as HTMLElement;
      expect(preceding.querySelector("h1, h2")).toBeNull();
    }
  });

  /** OFFER_PANE_FIXED_VIEWPORT_WORKSPACE_V1 regression coverage: scrolling
   * the catalog used to move the Offer pane too, because the pane relied
   * on `position: sticky` against document scroll — it only stayed in
   * place *after* the page had already scrolled it out of its natural
   * position once. The fix makes the two-column grid itself a real
   * fixed-height (desktop-only), `overflow-hidden` workspace, so neither
   * column's scrolling can ever move the other — there is no document
   * scroll for either column to react to in the first place. jsdom can't
   * measure real pixel scroll behavior, so this asserts the structural
   * contract that behavior depends on. */
  it("makes the workspace grid a fixed-height, overflow-hidden box on desktop, with each column scrolling independently", async () => {
    render(<HomePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zum Konfigurator (Test)" }));
    });
    await screen.findByText("Testartikel");

    const aside = screen.getByRole("complementary");
    const rightColumn = aside.parentElement as HTMLElement;
    const grid = rightColumn.parentElement as HTMLElement;
    const leftColumn = grid.children[0] as HTMLElement;

    // The workspace itself: a real fixed height on desktop (not a sticky
    // guess), and never itself a scroll container.
    expect(grid.className).toMatch(/lg:h-\[calc\(100dvh-110px\)\]/);
    expect(grid.className).toMatch(/(?:^|\s)lg:overflow-hidden(?:\s|$)/);
    expect(grid.className).not.toMatch(/sticky/);

    // Left column (catalog/context) scrolls independently of the page.
    expect(leftColumn.className).toMatch(/(?:^|\s)lg:h-full(?:\s|$)/);
    expect(leftColumn.className).toMatch(/(?:^|\s)lg:overflow-y-auto(?:\s|$)/);

    // Right column wrapper feeds a real height down to the aside, rather
    // than the aside computing its own via sticky/max-height.
    expect(rightColumn.className).toMatch(/(?:^|\s)lg:h-full(?:\s|$)/);
    expect(aside.className).toMatch(/(?:^|\s)lg:h-full(?:\s|$)/);
    expect(aside.className).not.toMatch(/sticky/);
    expect(aside.className).not.toMatch(/max-h-\[/);

    // Only one region inside the whole workspace is meant to scroll on
    // the right: the selected-position list. Header and footer must not
    // carry their own overflow/scroll declarations.
    const scrollRegion = screen.getByTestId("offer-summary-scroll-region");
    expect(scrollRegion.className).toMatch(/(?:^|\s)lg:overflow-y-auto(?:\s|$)/);
    expect(aside.className).not.toMatch(/(?:^|\s)lg:overflow-y-auto(?:\s|$)/);
  });
});
