/** Focused coverage for the compact editable row (approved split-screen
 * mockup): quantity, line total and remove stay visible by default;
 * Bezug (quantityMode), unit price, warnings and the composite
 * customization note move behind a details toggle — collapsed by
 * default, nothing dropped, a warning indicator stays visible even
 * collapsed so a blocking issue is never silently hidden. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { OfferLineItem } from "../OfferLineItem";
import type { CatalogItem, OfferLine } from "../../../types";

const simpleLine: OfferLine = {
  lineId: "line-1",
  itemId: "item-1",
  quantityMode: "total",
  quantity: 10,
  snapshot: {
    title: "Brötchen Mix 1",
    source_type: "internal",
    pricing_mode: "per_piece",
    price_type: "piece",
    chosen_price: 2.3,
    item_kind: "simple",
  },
};

const compositeLine: OfferLine = {
  ...simpleLine,
  lineId: "line-2",
  snapshot: { ...simpleLine.snapshot, title: "Fingerfood-Paket", item_kind: "composite" },
};

const catalogItem: CatalogItem = {
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

function noop() {
  /* no-op */
}

function renderRow(line: OfferLine, catalog?: CatalogItem) {
  return render(
    <ul>
      <OfferLineItem
        line={line}
        catalogItem={catalog}
        persons={10}
        onQuantityChange={noop}
        onModeChange={noop}
        onCustomizationNoteChange={noop}
        onRemove={noop}
      />
    </ul>
  );
}

describe("OfferLineItem — compact row", () => {
  it("shows title, quantity, line total and a remove control by default", () => {
    renderRow(simpleLine, catalogItem);
    expect(screen.getByText("Brötchen Mix 1")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Menge für/ })).toBeTruthy();
    expect(screen.getByText("23,00 €")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Brötchen Mix 1 entfernen" })).toBeTruthy();
  });

  it("collapses Bezug, unit price and the composite note behind a details toggle by default", () => {
    renderRow(compositeLine, catalogItem);
    expect(screen.queryByText("Bezug")).toBeNull();
    expect(screen.queryByText(/Preis pro Stück/)).toBeNull();
    expect(screen.queryByText("Änderungswunsch am Paket")).toBeNull();
  });

  it("reveals Bezug, unit price and the composite note when the details toggle is activated", () => {
    renderRow(compositeLine, catalogItem);
    fireEvent.click(screen.getByRole("button", { name: "Details anzeigen" }));
    expect(screen.getByText("Bezug")).toBeTruthy();
    expect(screen.getByText(/Preis pro Stück/)).toBeTruthy();
    expect(screen.getByText("Änderungswunsch am Paket")).toBeTruthy();
  });

  it("calls onRemove with the line id when the remove control is activated", () => {
    const onRemove = vi.fn();
    render(
      <ul>
        <OfferLineItem
          line={simpleLine}
          catalogItem={catalogItem}
          persons={10}
          onQuantityChange={noop}
          onModeChange={noop}
          onCustomizationNoteChange={noop}
          onRemove={onRemove}
        />
      </ul>
    );
    fireEvent.click(screen.getByRole("button", { name: "Brötchen Mix 1 entfernen" }));
    expect(onRemove).toHaveBeenCalledWith("line-1");
  });

  it("calls onQuantityChange with a whole number via the inline stepper", () => {
    const onQuantityChange = vi.fn();
    render(
      <ul>
        <OfferLineItem
          line={simpleLine}
          catalogItem={catalogItem}
          persons={10}
          onQuantityChange={onQuantityChange}
          onModeChange={noop}
          onCustomizationNoteChange={noop}
          onRemove={noop}
        />
      </ul>
    );
    fireEvent.click(screen.getByRole("button", { name: "Erhöhen" }));
    expect(onQuantityChange).toHaveBeenCalledWith("line-1", 11);
  });

  it("keeps a visible warning indicator on the collapsed row when warnings exist", () => {
    // quantity (0) below the catalog item's min_order (1) in "total" mode
    // triggers lineWarnings' MIN_ORDER_PIECE warning.
    renderRow({ ...simpleLine, quantity: 0 }, catalogItem);
    expect(screen.getByTitle("Hinweise vorhanden — Details anzeigen")).toBeTruthy();
  });
});
