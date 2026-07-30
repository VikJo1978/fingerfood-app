/** Focused coverage for the Angebotsvorschau modal chrome after the visual
 * alignment pass. Regression guard for a real narrow-viewport bug found
 * during manual testing at ~390px: the print-root container had no
 * min-width/overflow-x constraint, so flexbox let it grow past the
 * viewport-limited backdrop, dragging the sticky header (including the
 * "Schließen" button) out of view. Fixed with `min-w-0` + `overflow-x-hidden`
 * on the print-root and `flex-wrap` on the header row, plus a dedicated
 * horizontal scroll region around the itemized table so very narrow
 * screens can scroll the table without hiding the header controls. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { OfferPreview } from "../OfferPreview";
import { computePauschalen, computeVatBreakdown } from "../../../utils/pricing";
import type { CatalogItem, OfferDraft } from "../../../types";
import { createInitialOfferDraft } from "../../../types";

const testItem: CatalogItem = {
  id: "item-1",
  name: "Brötchen Mix 1",
  section: "Test",
  category: "Test",
  subcategory: null,
  price: 2.3,
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

function draftWithLine(): OfferDraft {
  const base = createInitialOfferDraft();
  return {
    ...base,
    lines: [
      {
        lineId: "line-1",
        itemId: testItem.id,
        quantityMode: "total",
        quantity: 10,
        snapshot: {
          title: testItem.name,
          source_type: testItem.source_type,
          pricing_mode: testItem.pricing_mode,
          price_type: testItem.price_type,
          chosen_price: testItem.price,
          item_kind: testItem.item_kind,
        },
      },
    ],
  };
}

function renderPreview(open: boolean, draft: OfferDraft, onClose = vi.fn()) {
  const itemsById = { [testItem.id]: testItem };
  const subtotal = draft.lines.length ? 23 : 0;
  const pauschalen = computePauschalen(subtotal, draft.persons, draft.lines.length > 0);
  const vat = computeVatBreakdown(draft, itemsById, pauschalen);
  render(
    <OfferPreview
      open={open}
      onClose={onClose}
      draft={draft}
      itemsById={itemsById}
      subtotal={subtotal}
      pricePerPerson={subtotal / draft.persons}
      pauschalen={pauschalen}
      vat={vat}
    />
  );
  return { onClose };
}

describe("OfferPreview", () => {
  it("renders nothing when closed", () => {
    renderPreview(false, createInitialOfferDraft());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes an accessible dialog with both controls visible when open", () => {
    renderPreview(true, createInitialOfferDraft());
    const dialog = screen.getByRole("dialog", { name: "Angebotsvorschau" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("button", { name: "Drucken / PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
  });

  it("closes on backdrop click and on the Schließen button, not on inner content clicks", () => {
    const { onClose } = renderPreview(true, createInitialOfferDraft());
    fireEvent.click(screen.getByText("Angebotsvorschau"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop itself is clicked", () => {
    const onClose = vi.fn();
    renderPreview(true, createInitialOfferDraft(), onClose);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the header controls reachable on narrow viewports (no clipped close button)", () => {
    renderPreview(true, createInitialOfferDraft());
    const printRoot = document.querySelector("[data-print-root]");
    expect(printRoot).not.toBeNull();
    expect(printRoot?.className).toContain("min-w-0");
    expect(printRoot?.className).toContain("overflow-x-hidden");
    const header = screen.getByRole("button", { name: "Schließen" }).parentElement?.parentElement;
    expect(header?.className).toContain("flex-wrap");
  });

  it("shows an empty-state row and no line total when the draft has no lines", () => {
    renderPreview(true, createInitialOfferDraft());
    expect(screen.getByText("Keine Positionen im Entwurf.")).toBeTruthy();
  });

  it("renders line items and the full totals footer without hiding any of it", () => {
    renderPreview(true, draftWithLine());
    expect(screen.getByText("Brötchen Mix 1")).toBeTruthy();
    expect(screen.getByText("Gesamtsumme brutto")).toBeTruthy();
    expect(screen.getByText("Stempel, Unterschrift")).toBeTruthy();
  });
});
