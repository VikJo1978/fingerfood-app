import { describe, expect, it } from "vitest";
import { createInitialOfferDraft } from "../../types";
import {
  draftStorageKey,
  normalizeRestoredOfferDraft,
  readDraftStateFromSession,
  saveDraftStateToSession,
  type DraftPersistenceScope,
} from "../draftPersistence";

class FakeStorage implements Pick<Storage, "getItem" | "setItem"> {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const MANUAL: DraftPersistenceScope = { kind: "manual" };

describe("normalizeRestoredOfferDraft", () => {
  it("accepts a current draft and preserves explicit current fields", () => {
    const source = createInitialOfferDraft();
    source.persons = 42;
    source.orderContext.companyName = "Restore GmbH";
    source.budgetEnabled = true;
    source.budgetType = "per_person";
    source.budgetBasis = "net";
    source.budgetScope = "positions_only";

    const restored = normalizeRestoredOfferDraft(source);

    expect(restored).not.toBeNull();
    expect(restored?.persons).toBe(42);
    expect(restored?.orderContext.companyName).toBe("Restore GmbH");
    expect(restored?.budgetType).toBe("per_person");
    expect(restored?.budgetBasis).toBe("net");
    expect(restored?.budgetScope).toBe("positions_only");
  });

  it("normalizes legacy budget fields and later charge substructures", () => {
    const source = createInitialOfferDraft() as unknown as Record<string, unknown>;
    delete source.budgetType;
    delete source.budgetBasis;
    delete source.budgetScope;

    const charges = source.chargesDefinition as Record<string, unknown>;
    const delivery = charges.delivery as Record<string, unknown>;
    delete delivery.fulfillment;
    delete charges.returnLogistics;

    const restored = normalizeRestoredOfferDraft(source);

    expect(restored).not.toBeNull();
    expect(restored?.budgetType).toBe("total");
    expect(restored?.budgetBasis).toBe("net");
    expect(restored?.budgetScope).toBe("positions_only");
    expect(restored?.chargesDefinition.delivery.fulfillment?.fulfillmentMode).toBe("UNKNOWN");
    expect(restored?.chargesDefinition.returnLogistics?.mode).toBe("NEXT_WORKING_DAY");
  });

  it("accepts a draft predating chargesDefinition and supplies current defaults", () => {
    const source = createInitialOfferDraft() as unknown as Record<string, unknown>;
    delete source.chargesDefinition;

    const restored = normalizeRestoredOfferDraft(source);

    expect(restored).not.toBeNull();
    expect(restored?.chargesDefinition.delivery.amountCents).toBe(3500);
    expect(restored?.chargesDefinition.delivery.fulfillment?.fulfillmentMode).toBe("UNKNOWN");
    expect(restored?.chargesDefinition.returnLogistics?.mode).toBe("NEXT_WORKING_DAY");
  });

  it("rejects malformed nested fulfillment instead of trusting opaque JSON", () => {
    const source = createInitialOfferDraft() as unknown as Record<string, unknown>;
    const charges = source.chargesDefinition as Record<string, unknown>;
    const delivery = charges.delivery as Record<string, unknown>;
    delivery.fulfillment = {
      fulfillmentMode: "TELEPORT",
      deliveryAddressMode: "UNKNOWN",
      invoiceAddress: {},
      deliveryAddress: {},
    };

    expect(normalizeRestoredOfferDraft(source)).toBeNull();
  });

  it("rejects unrelated and structurally incomplete payloads", () => {
    expect(normalizeRestoredOfferDraft({ hello: "world" })).toBeNull();
    expect(
      normalizeRestoredOfferDraft({
        orderContext: {},
        persons: 12,
        budgetEnabled: false,
        totalBudget: 100,
        lines: [],
      })
    ).toBeNull();
  });
});

describe("backend draft identity in active session persistence", () => {
  it("round-trips backendDraftId together with the normalized active draft", () => {
    const storage = new FakeStorage();
    const draft = createInitialOfferDraft();
    draft.orderContext.companyName = "Persisted GmbH";

    saveDraftStateToSession(MANUAL, draft, "backend-draft-17", storage);
    const restored = readDraftStateFromSession(MANUAL, storage);

    expect(restored?.backendDraftId).toBe("backend-draft-17");
    expect(restored?.draft.orderContext.companyName).toBe("Persisted GmbH");
  });

  it("keeps old session envelopes without backend_draft_id readable", () => {
    const storage = new FakeStorage();
    storage.setItem(
      draftStorageKey(MANUAL),
      JSON.stringify({
        schema_version: "fingerfood.configurator-draft.v1",
        scope_key: draftStorageKey(MANUAL),
        saved_at: new Date().toISOString(),
        draft: createInitialOfferDraft(),
      })
    );

    const restored = readDraftStateFromSession(MANUAL, storage);
    expect(restored?.backendDraftId).toBeNull();
    expect(restored?.draft).not.toBeNull();
  });
});
