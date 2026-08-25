import { describe, expect, it } from "vitest";
import {
	createInitialChargesDefinition,
	createInitialOfferDraft,
} from "../../types";
import {
	type DraftPersistenceScope,
	draftStorageKey,
	readDraftFromSession,
} from "../draftPersistence";
import { buildChargesDefinition } from "../offerSnapshotRequest";
import { computeChargesCents } from "../pricing";

class FakeStorage implements Pick<Storage, "getItem" | "setItem"> {
	private store = new Map<string, string>();
	getItem(key: string): string | null {
		return this.store.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
}

const SCOPE: DraftPersistenceScope = { kind: "manual" };

describe("issue #171 return logistics", () => {
	it("defaults fresh drafts to next working day without a separate fee", () => {
		const charges = createInitialChargesDefinition();
		expect(charges.returnLogistics).toEqual({
			mode: "NEXT_WORKING_DAY",
			pickupWindowText: null,
			sameDayFeeCents: 0,
		});
		expect(computeChargesCents(charges, 20).returnPickupCents).toBe(0);
	});

	it("maps SAME_DAY to the Core wire contract and includes its fee in totals", () => {
		const charges = createInitialChargesDefinition();
		charges.returnLogistics = {
			mode: "SAME_DAY",
			pickupWindowText: "22:00–23:00",
			sameDayFeeCents: 4500,
		};
		expect(buildChargesDefinition(charges).return_logistics).toEqual({
			mode: "SAME_DAY",
			pickup_window_text: "22:00–23:00",
			same_day_fee_cents: 4500,
		});
		expect(computeChargesCents(charges, 20).returnPickupCents).toBe(4500);
	});

	it("keeps a configured same-day rate when NEXT_WORKING_DAY is selected but does not charge it", () => {
		const charges = createInitialChargesDefinition();
		charges.returnLogistics = {
			mode: "NEXT_WORKING_DAY",
			pickupWindowText: null,
			sameDayFeeCents: 4500,
		};
		expect(
			buildChargesDefinition(charges).return_logistics.same_day_fee_cents,
		).toBe(4500);
		expect(computeChargesCents(charges, 20).returnPickupCents).toBe(0);
	});

	it("normalizes a pre-#171 persisted draft to NEXT_WORKING_DAY", () => {
		const storage = new FakeStorage();
		const draft = createInitialOfferDraft();
		delete draft.chargesDefinition.returnLogistics;
		storage.setItem(
			draftStorageKey(SCOPE),
			JSON.stringify({
				schema_version: "fingerfood.configurator-draft.v1",
				scope_key: draftStorageKey(SCOPE),
				saved_at: new Date().toISOString(),
				draft,
			}),
		);
		const restored = readDraftFromSession(SCOPE, storage);
		expect(restored?.chargesDefinition.returnLogistics).toEqual({
			mode: "NEXT_WORKING_DAY",
			pickupWindowText: null,
			sameDayFeeCents: 0,
		});
	});
});
