import { describe, expect, it } from "vitest";
import {
  clearDraftFromSession,
  draftStorageKey,
  readDraftFromSession,
  saveDraftToSession,
  type DraftPersistenceScope,
} from "../draftPersistence";
import { createInitialOfferDraft } from "../../types";
import type { OfferDraft, OfferLine } from "../../types";

class FakeStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const INQUIRY_A: DraftPersistenceScope = {
  kind: "inquiry",
  inquiryId: "inq-a",
};
const INQUIRY_B: DraftPersistenceScope = {
  kind: "inquiry",
  inquiryId: "inq-b",
};
const MANUAL: DraftPersistenceScope = { kind: "manual" };

function draftWithBudget(overrides: Partial<OfferDraft> = {}): OfferDraft {
  return { ...createInitialOfferDraft(), ...overrides };
}

const sampleLine: OfferLine = {
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
  },
};

describe("draftStorageKey", () => {
  it("scopes inquiry and manual drafts under different keys", () => {
    expect(draftStorageKey(INQUIRY_A)).not.toBe(draftStorageKey(MANUAL));
    expect(draftStorageKey(INQUIRY_A)).not.toBe(draftStorageKey(INQUIRY_B));
  });
});

describe("saveDraftToSession / readDraftFromSession", () => {
  it("round-trips a full draft including the new budget-basis fields", () => {
    const storage = new FakeStorage();
    const draft = draftWithBudget({
      persons: 30,
      budgetEnabled: true,
      totalBudget: 35,
      budgetType: "per_person",
      budgetBasis: "net",
      budgetScope: "positions_only",
      paymentMethod: "BAR_VOR_ORT",
      chargesDefinition: {
        buffet: { baseMode: "PAUSCHALE", pauschalePerPersonCents: 75 },
        delivery: { amountCents: 0 },
        dishware: {
          baseMode: "NONE",
          pauschalePerPersonCents: 200,
          additionalLines: [
            {
              lineId: "dishware-1",
              description: "Teller extra",
              quantity: 24,
              unitNetCents: 125,
            },
          ],
        },
      },
      lines: [sampleLine],
    });
    saveDraftToSession(INQUIRY_A, draft, storage);
    const restored = readDraftFromSession(INQUIRY_A, storage);
    expect(restored).not.toBeNull();
    expect(restored?.persons).toBe(30);
    expect(restored?.budgetType).toBe("per_person");
    expect(restored?.budgetBasis).toBe("net");
    expect(restored?.budgetScope).toBe("positions_only");
    expect(restored?.paymentMethod).toBe("BAR_VOR_ORT");
    expect(restored?.chargesDefinition.delivery.amountCents).toBe(0);
    expect(restored?.chargesDefinition.buffet.baseMode).toBe("PAUSCHALE");
    expect(restored?.chargesDefinition.dishware.additionalLines).toEqual([
      {
        lineId: "dishware-1",
        description: "Teller extra",
        quantity: 24,
        unitNetCents: 125,
      },
    ]);
    expect(restored?.lines).toHaveLength(1);
  });

  it("round-trips a zero-guest draft with complete chargesDefinition and budget intact", () => {
    const storage = new FakeStorage();
    const draft = draftWithBudget({
      persons: 0,
      budgetEnabled: true,
      totalBudget: 35,
      budgetType: "per_person",
      budgetBasis: "net",
      budgetScope: "positions_only",
      chargesDefinition: {
        buffet: { baseMode: "PAUSCHALE", pauschalePerPersonCents: 75 },
        delivery: { amountCents: 0 },
        dishware: {
          baseMode: "PAUSCHALE",
          pauschalePerPersonCents: 250,
          additionalLines: [
            {
              lineId: "dishware-1",
              description: "Teller extra",
              quantity: 24,
              unitNetCents: 125,
            },
            {
              lineId: "dishware-2",
              description: "Glaser",
              quantity: 12,
              unitNetCents: 80,
            },
          ],
        },
      },
      lines: [sampleLine],
    });
    saveDraftToSession(INQUIRY_A, draft, storage);
    const restored = readDraftFromSession(INQUIRY_A, storage);
    expect(restored).not.toBeNull();
    expect(restored?.persons).toBe(0);
    expect(restored?.budgetEnabled).toBe(true);
    expect(restored?.budgetType).toBe("per_person");
    expect(restored?.budgetBasis).toBe("net");
    expect(restored?.budgetScope).toBe("positions_only");
    expect(restored?.chargesDefinition).toEqual({
      ...draft.chargesDefinition,
      delivery: {
        ...draft.chargesDefinition.delivery,
        fulfillment: createInitialOfferDraft().chargesDefinition.delivery.fulfillment,
      },
      returnLogistics: {
        mode: "NEXT_WORKING_DAY",
        pickupWindowText: null,
        sameDayFeeCents: 0,
      },
    });
    expect(restored?.chargesDefinition.delivery.amountCents).toBe(0);
    expect(restored?.chargesDefinition.dishware.additionalLines).toEqual(
      draft.chargesDefinition.dishware.additionalLines
    );
  });

  it("normalizes blank legacy address countries to DE", () => {
    const storage = new FakeStorage();
    const draft = createInitialOfferDraft();
    draft.chargesDefinition.delivery.fulfillment = {
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SEPARATE",
      invoiceAddress: {
        street: "Brooksheide 3",
        postalCode: "22549",
        city: "Hamburg",
        country: "",
      },
      deliveryAddress: {
        street: "Auf dem Königslande 4",
        postalCode: "22041",
        city: "Hamburg",
        country: "",
      },
    };

    saveDraftToSession(INQUIRY_A, draft, storage);
    const restored = readDraftFromSession(INQUIRY_A, storage);

    expect(restored?.chargesDefinition.delivery.fulfillment?.invoiceAddress.country).toBe("DE");
    expect(restored?.chargesDefinition.delivery.fulfillment?.deliveryAddress.country).toBe("DE");
  });

  it("keeps payment method unset for legacy drafts that predate the selector", () => {
    const storage = new FakeStorage();
    const draft = createInitialOfferDraft();

    saveDraftToSession(INQUIRY_A, draft, storage);
    const restored = readDraftFromSession(INQUIRY_A, storage);

    expect(restored?.paymentMethod).toBeUndefined();
  });

  it("isolates different Inquiries — draft saved under Inquiry A never returns for Inquiry B", () => {
    const storage = new FakeStorage();
    saveDraftToSession(INQUIRY_A, draftWithBudget({ persons: 11 }), storage);
    expect(readDraftFromSession(INQUIRY_B, storage)).toBeNull();
  });

  it("isolates the manual flow from any Inquiry-scoped draft", () => {
    const storage = new FakeStorage();
    saveDraftToSession(INQUIRY_A, draftWithBudget({ persons: 11 }), storage);
    expect(readDraftFromSession(MANUAL, storage)).toBeNull();
    saveDraftToSession(MANUAL, draftWithBudget({ persons: 22 }), storage);
    expect(readDraftFromSession(INQUIRY_A, storage)?.persons).toBe(11);
    expect(readDraftFromSession(MANUAL, storage)?.persons).toBe(22);
  });

  it("returns null for malformed JSON", () => {
    const storage = new FakeStorage();
    storage.setItem(draftStorageKey(INQUIRY_A), "{not json");
    expect(readDraftFromSession(INQUIRY_A, storage)).toBeNull();
  });

  it("returns null for an unrelated JSON shape", () => {
    const storage = new FakeStorage();
    storage.setItem(draftStorageKey(INQUIRY_A), JSON.stringify({ hello: "world" }));
    expect(readDraftFromSession(INQUIRY_A, storage)).toBeNull();
  });

  it("returns null when schema_version does not match", () => {
    const storage = new FakeStorage();
    storage.setItem(
      draftStorageKey(INQUIRY_A),
      JSON.stringify({
        schema_version: "some-old-version",
        scope_key: draftStorageKey(INQUIRY_A),
        saved_at: new Date().toISOString(),
        draft: draftWithBudget(),
      })
    );
    expect(readDraftFromSession(INQUIRY_A, storage)).toBeNull();
  });

  it("returns null when the stored envelope's scope_key does not match the requested scope (tamper/cross-scope guard)", () => {
    const storage = new FakeStorage();
    saveDraftToSession(INQUIRY_B, draftWithBudget({ persons: 99 }), storage);
    const stolen = storage.getItem(draftStorageKey(INQUIRY_B));
    expect(stolen).not.toBeNull();
    storage.setItem(draftStorageKey(INQUIRY_A), stolen!);
    expect(readDraftFromSession(INQUIRY_A, storage)).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const storage = new FakeStorage();
    const broken = { orderContext: {}, persons: 10 };
    storage.setItem(
      draftStorageKey(INQUIRY_A),
      JSON.stringify({
        schema_version: "fingerfood.configurator-draft.v1",
        scope_key: draftStorageKey(INQUIRY_A),
        saved_at: new Date().toISOString(),
        draft: broken,
      })
    );
    expect(readDraftFromSession(INQUIRY_A, storage)).toBeNull();
  });

  it("rejects a negative guest count", () => {
    const storage = new FakeStorage();
    storage.setItem(
      draftStorageKey(INQUIRY_A),
      JSON.stringify({
        schema_version: "fingerfood.configurator-draft.v1",
        scope_key: draftStorageKey(INQUIRY_A),
        saved_at: new Date().toISOString(),
        draft: draftWithBudget({ persons: -1 }),
      })
    );
    expect(readDraftFromSession(INQUIRY_A, storage)).toBeNull();
  });

  it("normalizes a legacy draft (budget amount present, no basis fields) to TOTAL/NET/POSITIONS_ONLY", () => {
    const storage = new FakeStorage();
    const legacyDraft = draftWithBudget({
      budgetEnabled: true,
      totalBudget: 1200,
    });
    // Simulate a draft persisted before the budget-basis selectors existed.
    const legacyRecord = legacyDraft as unknown as Record<string, unknown>;
    delete legacyRecord.budgetType;
    delete legacyRecord.budgetBasis;
    delete legacyRecord.budgetScope;
    delete legacyRecord.chargesDefinition;
    storage.setItem(
      draftStorageKey(INQUIRY_A),
      JSON.stringify({
        schema_version: "fingerfood.configurator-draft.v1",
        scope_key: draftStorageKey(INQUIRY_A),
        saved_at: new Date().toISOString(),
        draft: legacyRecord,
      })
    );
    const restored = readDraftFromSession(INQUIRY_A, storage);
    expect(restored).not.toBeNull();
    expect(restored?.budgetType).toBe("total");
    expect(restored?.budgetBasis).toBe("net");
    expect(restored?.budgetScope).toBe("positions_only");
    expect(restored?.chargesDefinition).toEqual(createInitialOfferDraft().chargesDefinition);
    expect(restored?.totalBudget).toBe(1200);
  });

  it("does not crash when storage throws (private browsing / quota)", () => {
    const throwingStorage: Pick<Storage, "setItem" | "getItem" | "removeItem"> = {
      setItem: () => {
        throw new Error("quota exceeded");
      },
      getItem: () => {
        throw new Error("unavailable");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
    };
    expect(() => saveDraftToSession(INQUIRY_A, draftWithBudget(), throwingStorage)).not.toThrow();
    expect(readDraftFromSession(INQUIRY_A, throwingStorage)).toBeNull();
    expect(() => clearDraftFromSession(INQUIRY_A, throwingStorage)).not.toThrow();
  });
});

describe("clearDraftFromSession", () => {
  it("clears only the given scope, leaving other scopes untouched", () => {
    const storage = new FakeStorage();
    saveDraftToSession(INQUIRY_A, draftWithBudget({ persons: 5 }), storage);
    saveDraftToSession(INQUIRY_B, draftWithBudget({ persons: 6 }), storage);
    clearDraftFromSession(INQUIRY_A, storage);
    expect(readDraftFromSession(INQUIRY_A, storage)).toBeNull();
    expect(readDraftFromSession(INQUIRY_B, storage)?.persons).toBe(6);
  });
});

describe("canonical logistics timing draft compatibility", () => {
  it("round-trips explicit delivery and SAME_DAY pickup timing", () => {
    const storage = new FakeStorage();
    const draft = draftWithBudget({
      orderContext: {
        ...createInitialOfferDraft().orderContext,
        deliveryDate: "2026-10-01",
        deliveryWindowStart: "18:00",
        deliveryWindowEnd: "19:00",
      },
      chargesDefinition: {
        ...createInitialOfferDraft().chargesDefinition,
        returnLogistics: {
          mode: "SAME_DAY",
          pickupWindowText: "22:00–23:00",
          sameDayFeeCents: 2500,
          pickupWindowStartLocal: "22:00",
          pickupWindowEndLocal: "23:00",
        },
      },
    });
    saveDraftToSession(INQUIRY_A, draft, storage);
    const restored = readDraftFromSession(INQUIRY_A, storage);
    expect(restored?.orderContext.deliveryWindowStart).toBe("18:00");
    expect(restored?.chargesDefinition.returnLogistics?.pickupWindowEndLocal).toBe("23:00");
  });

  it("keeps an older draft with no canonical timing readable", () => {
    const storage = new FakeStorage();
    const legacy = createInitialOfferDraft();
    saveDraftToSession(INQUIRY_A, legacy, storage);
    const restored = readDraftFromSession(INQUIRY_A, storage);
    expect(restored).not.toBeNull();
    expect(restored?.orderContext.deliveryWindowStart).toBeUndefined();
    expect(restored?.chargesDefinition.returnLogistics?.pickupWindowStartLocal).toBeUndefined();
  });
});
