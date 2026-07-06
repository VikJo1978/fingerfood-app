/** filterCatalog: search must reach dish text inside buffet compositions,
 * not just name/description/category/diet_type. Bug found 2026-07-06
 * (owner, live): searching "fisch" only found the one item with "Fisch" in
 * its own name — buffets with fish only in items_included were invisible,
 * since a buffet's `description` is generic boilerplate, not its dish list. */
import { describe, expect, it } from "vitest";

import type { CatalogItem } from "../../types";
import { filterCatalog } from "../filterCatalog";

const baseOpts = {
  search: "",
  section: "",
  priceType: "" as const,
  diet: "" as const,
  excludeAllergens: "",
  maxUnitPriceRaw: "",
  module: "" as const,
};

function item(overrides: Partial<CatalogItem>): CatalogItem {
  return {
    id: "x",
    name: "Generic Item",
    section: "Test",
    category: "Test",
    subcategory: null,
    price: 1,
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
    ...overrides,
  };
}

describe("filterCatalog search", () => {
  it("still matches by name (regression guard)", () => {
    const items = [item({ id: "a", name: "Asia Teigsäckchen mit pikantem Fisch gefüllt" })];
    const out = filterCatalog(items, { ...baseOpts, search: "fisch" });
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });

  it("matches dishes inside a buffet's items_included, not just its generic description", () => {
    const buffet = item({
      id: "b",
      name: "Hanseaten Büffet",
      item_kind: "composite",
      description: "Hanseaten Büffet als Buffet/Paket, Paketpreis pro Person. Zusammensetzung siehe Details.",
      items_included: "Kalt:\n- Schaustück vom pochierten Atlantiklachs\n- Große Auswahl von Räucherfischen der Saison",
    });
    const out = filterCatalog([buffet], { ...baseOpts, search: "fisch" });
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });

  it("does not match unrelated items", () => {
    const items = [item({ id: "c", name: "Brötchen Mix 1", items_included: "Avocadocreme mit Tomate" })];
    const out = filterCatalog(items, { ...baseOpts, search: "fisch" });
    expect(out).toEqual([]);
  });
});
