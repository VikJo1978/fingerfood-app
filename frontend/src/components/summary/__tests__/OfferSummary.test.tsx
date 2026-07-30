/** Focused coverage for the primary "Angebot in Core vorbereiten" action's
 * visibility/enabled-state contract after the visual alignment pass — this
 * button must stay the visually distinct primary action and its
 * enabled/disabled/hidden states must still reflect the same business rules
 * (Core handoff present, at least one line) the restyle was not meant to
 * change. Also covers opening the Angebotsvorschau preview from here. */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { OfferSummary } from "../OfferSummary";
import { computePauschalen, computeVatBreakdown } from "../../../utils/pricing";
import type { OfferDraft } from "../../../types";
import { createInitialOfferDraft } from "../../../types";

function noop() {
  /* no-op */
}

function renderSummary(overrides: {
  draft?: OfferDraft;
  canPrepareInCore?: boolean;
}) {
  const draft = overrides.draft ?? createInitialOfferDraft();
  const itemsById = {};
  const subtotal = 0;
  const pauschalen = computePauschalen(subtotal, draft.persons, draft.lines.length > 0);
  const vat = computeVatBreakdown(draft, itemsById, pauschalen);
  render(
    <OfferSummary
      draft={draft}
      itemsById={itemsById}
      subtotal={subtotal}
      pricePerPerson={0}
      pauschalen={pauschalen}
      vat={vat}
      onQuantityChange={noop}
      onModeChange={noop}
      onCustomizationNoteChange={noop}
      onRemove={noop}
      onExportJson={noop}
      onExportCsv={noop}
      onExportProposalJson={noop}
      draftSaveStatus="idle"
      draftSaveMessage={null}
      onSaveDraft={noop}
      prepareStatus="idle"
      prepareMessage={null}
      canPrepareInCore={overrides.canPrepareInCore ?? false}
      onPrepareInCore={noop}
    />
  );
}

describe("OfferSummary — primary action visibility", () => {
  it("hides the Core-prepare action entirely without an imported Inquiry", () => {
    renderSummary({ canPrepareInCore: false });
    expect(screen.queryByRole("button", { name: "Angebot in Core vorbereiten" })).toBeNull();
  });

  it("shows the Core-prepare action disabled when the draft has no lines yet", () => {
    renderSummary({ canPrepareInCore: true });
    const btn = screen.getByRole("button", { name: "Angebot in Core vorbereiten" });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("enables the Core-prepare action once a line is added", () => {
    const draft: OfferDraft = {
      ...createInitialOfferDraft(),
      lines: [
        {
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
        },
      ],
    };
    renderSummary({ draft, canPrepareInCore: true });
    const btn = screen.getByRole("button", { name: "Angebot in Core vorbereiten" });
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("opens the Angebotsvorschau modal from its secondary button", () => {
    renderSummary({});
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Angebotsvorschau anzeigen" }));
    expect(screen.getByRole("dialog", { name: "Angebotsvorschau" })).toBeTruthy();
  });
});
