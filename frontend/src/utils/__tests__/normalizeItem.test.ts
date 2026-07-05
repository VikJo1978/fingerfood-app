/** normalizeCatalogItem: defensive normalization of API payloads. */
import { describe, expect, it } from "vitest";

import { normalizeCatalogItem, normalizeItemList } from "../normalizeItem";

const minimal = { id: "x1", name: "Ding" };

describe("normalizeCatalogItem", () => {
  it("rejects non-objects and missing id/name", () => {
    expect(normalizeCatalogItem(null)).toBeNull();
    expect(normalizeCatalogItem("str")).toBeNull();
    expect(normalizeCatalogItem({})).toBeNull();
    expect(normalizeCatalogItem({ id: "x" })).toBeNull();
    expect(normalizeCatalogItem({ name: "y" })).toBeNull();
  });

  it("applies safe defaults for a minimal item", () => {
    const item = normalizeCatalogItem(minimal);
    expect(item).not.toBeNull();
    expect(item!.price).toBe(0);
    expect(item!.min_order).toBe(1);
    expect(item!.unit_label).toBe("Stück");
    expect(item!.price_type).toBe("piece");
    expect(item!.module).toBe("food");
    expect(item!.item_kind).toBe("simple");
    expect(item!.pricing_mode).toBe("per_piece");
    expect(item!.diet_type).toBe("omnivore"); // foodish default
  });

  it("derives pricing_mode from price_type when absent", () => {
    const item = normalizeCatalogItem({ ...minimal, price_type: "person" });
    expect(item!.pricing_mode).toBe("per_person");
  });

  it("floors and guards min_order", () => {
    expect(normalizeCatalogItem({ ...minimal, min_order: 7.9 })!.min_order).toBe(7);
    expect(normalizeCatalogItem({ ...minimal, min_order: 0 })!.min_order).toBe(1);
    expect(normalizeCatalogItem({ ...minimal, min_order: "20" })!.min_order).toBe(1);
  });

  it("drops non-finite prices", () => {
    expect(normalizeCatalogItem({ ...minimal, price: Number.NaN })!.price).toBe(0);
    expect(normalizeCatalogItem({ ...minimal, price: "3.5" })!.price).toBe(0);
  });

  it("sanitizes allergens to known codes only", () => {
    const item = normalizeCatalogItem({ ...minimal, allergens: ["nuts", "kryptonite", 5] });
    expect(item!.allergens).toEqual(["nuts"]);
  });

  it("non-foodish module gets no diet defaults", () => {
    const item = normalizeCatalogItem({ ...minimal, module: "equipment" });
    expect(item!.diet_type).toBeUndefined();
    expect(item!.allergens).toBeUndefined();
  });

  it("merges partial ingredient_flags over defaults", () => {
    const item = normalizeCatalogItem({
      ...minimal,
      ingredient_flags: { contains_meat: true, contains_unicorn: true },
    });
    expect(item!.ingredient_flags!.contains_meat).toBe(true);
    expect(item!.ingredient_flags!.contains_fish).toBe(false);
    expect("contains_unicorn" in item!.ingredient_flags!).toBe(false);
  });
});

describe("normalizeItemList", () => {
  it("filters invalid rows and keeps valid ones", () => {
    const out = normalizeItemList([minimal, null, { id: "no-name" }, "junk"]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("x1");
  });

  it("returns empty for non-arrays", () => {
    expect(normalizeItemList({})).toEqual([]);
    expect(normalizeItemList(undefined)).toEqual([]);
  });
});
