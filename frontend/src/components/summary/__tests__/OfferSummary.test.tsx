/** Focused coverage for the primary "Angebot in Core vorbereiten" action's
 * visibility/enabled-state contract after the visual alignment pass — this
 * button must stay the visually distinct primary action and its
 * enabled/disabled/hidden states must still reflect the same business rules
 * (Core handoff present, at least one line) the restyle was not meant to
 * change. Also covers opening the Angebotsvorschau preview from here. */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

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
  const pauschalen = computePauschalen(
    subtotal,
    draft.persons,
    draft.lines.length > 0,
    draft.chargesDefinition
  );
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
      onChargesChange={noop}
      createChargeLineId={() => "charge-line-1"}
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

  it("opens the Pauschalen & Lieferung modal from compact charge rows", () => {
    renderSummary({});
    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    expect(screen.getByRole("dialog", { name: "Pauschalen & Lieferung" })).toBeTruthy();
    expect(screen.getByLabelText("Anlieferung netto")).toBeTruthy();
  });

  it("shows explicit default charges in the compact rows, including delivery on an empty draft", () => {
    renderSummary({});
    expect(screen.getByText("Büffetpauschale").parentElement?.textContent).toContain("0,00");
    expect(screen.getByText("Geschirr").parentElement?.textContent).toContain("0,00");
    expect(screen.getByText("Anlieferung").parentElement?.textContent).toContain("35,00");
  });

  function draftWithOneLine(overrides: Partial<OfferDraft>): OfferDraft {
    return {
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
      ...overrides,
    };
  }

  it("blocks the Core-prepare action for a PER_PERSON budget with guest_count=0, with a validation reason", () => {
    const draft = draftWithOneLine({
      persons: 0,
      budgetEnabled: true,
      budgetType: "per_person",
      totalBudget: 25,
    });
    renderSummary({ draft, canPrepareInCore: true });
    const btn = screen.getByRole("button", { name: "Angebot in Core vorbereiten" });
    expect(btn.hasAttribute("disabled")).toBe(true);
    // Both the Budget stat card and the prepare-action area show their own
    // "Personenzahl erforderlich" reason — assert the specific one next to
    // the blocked action, not just that some alert exists somewhere.
    expect(screen.getByText(/erst vorbereitet werden/).textContent).toMatch(
      /Personenzahl erforderlich/
    );
  });

  it("blocks the Core-prepare action when guest_count=0, even for a TOTAL budget", () => {
    const draft = draftWithOneLine({
      persons: 0,
      budgetEnabled: true,
      budgetType: "total",
      totalBudget: 500,
    });
    renderSummary({ draft, canPrepareInCore: true });
    const btn = screen.getByRole("button", { name: "Angebot in Core vorbereiten" });
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Angebot vorzubereiten/).textContent).toMatch(
      /Personenzahl erforderlich/
    );
  });

  it("blocks prepare and explains the reason when a Pauschale is enabled without guests", () => {
    const draft = draftWithOneLine({
      persons: 0,
      chargesDefinition: {
        ...createInitialOfferDraft().chargesDefinition,
        buffet: { baseMode: "PAUSCHALE", pauschalePerPersonCents: 50 },
      },
    });
    renderSummary({ draft, canPrepareInCore: true });
    expect(
      screen.getByRole("button", { name: "Angebot in Core vorbereiten" }).hasAttribute("disabled")
    ).toBe(true);
    expect(screen.getByText(/Büffet- oder Geschirrpauschale/)).toBeTruthy();
  });

  it("does not block the Core-prepare action for a PER_PERSON budget with a valid positive guest count", () => {
    const draft = draftWithOneLine({
      persons: 30,
      budgetEnabled: true,
      budgetType: "per_person",
      totalBudget: 25,
    });
    renderSummary({ draft, canPrepareInCore: true });
    const btn = screen.getByRole("button", { name: "Angebot in Core vorbereiten" });
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/** Regression coverage for the scrolling UX fix: with several lines
 * selected, totals/Pauschalen and the two final action buttons
 * ("Angebotsvorschau anzeigen", "Angebot in Core vorbereiten") used to end
 * up far below the fold inside a single tall panel with no way to reach
 * them short of scrolling the whole page past a pinned sticky column.
 * jsdom doesn't evaluate real CSS/media queries, so these assert the
 * structural contract (DOM containment + the `lg:`-scoped class tokens
 * that drive it) rather than pixel layout — the actual pixel behavior was
 * verified manually in a real browser at 1440x900 and at 768/390px. */
describe("OfferSummary — scroll/fixed-footer structure", () => {
  function draftWithLines(count: number): OfferDraft {
    const base = createInitialOfferDraft();
    return {
      ...base,
      lines: Array.from({ length: count }, (_, i) => ({
        lineId: `line-${i}`,
        itemId: `item-${i}`,
        quantityMode: "total" as const,
        quantity: 10,
        snapshot: {
          title: `Artikel ${i}`,
          source_type: "internal" as const,
          pricing_mode: "per_piece" as const,
          price_type: "piece" as const,
          chosen_price: 2.3,
          item_kind: "simple" as const,
        },
      })),
    };
  }

  it("scopes the line-items scroll region to lg: only — no unprefixed overflow/height constraint for mobile", () => {
    renderSummary({ draft: draftWithLines(3), canPrepareInCore: true });
    const region = screen.getByTestId("offer-summary-scroll-region");
    expect(region.className).toMatch(/lg:overflow-y-auto/);
    expect(region.className).toMatch(/lg:min-h-0/);
    expect(region.className).toMatch(/lg:flex-1/);
    // No bare (unprefixed) overflow-y-auto or max-h-* — those would force a
    // cramped fixed-height scroller on mobile/tablet too.
    expect(region.className).not.toMatch(/(?:^|\s)overflow-y-auto/);
    expect(region.className).not.toMatch(/(?:^|\s)max-h-/);
  });

  it("keeps totals, Pauschalen and both final action buttons outside the scrollable region", () => {
    renderSummary({ draft: draftWithLines(3), canPrepareInCore: true });
    const region = screen.getByTestId("offer-summary-scroll-region");

    const positionenLabel = screen.getByText(/^Positionen \(/);
    const pauschaleLabel = screen.getByText("Büffetpauschale");
    const previewButton = screen.getByRole("button", { name: "Angebotsvorschau anzeigen" });
    const prepareButton = screen.getByRole("button", { name: "Angebot in Core vorbereiten" });

    expect(region.contains(positionenLabel)).toBe(false);
    expect(region.contains(pauschaleLabel)).toBe(false);
    expect(region.contains(previewButton)).toBe(false);
    expect(region.contains(prepareButton)).toBe(false);
  });

  it("keeps the primary action (Angebot in Core vorbereiten) specifically outside the scrollable region regardless of line count", () => {
    renderSummary({ draft: draftWithLines(12), canPrepareInCore: true });
    const region = screen.getByTestId("offer-summary-scroll-region");
    const prepareButton = screen.getByRole("button", { name: "Angebot in Core vorbereiten" });
    expect(region.contains(prepareButton)).toBe(false);
    // It's still enabled/reachable, not just present.
    expect(prepareButton.hasAttribute("disabled")).toBe(false);
  });

  it("puts the line items themselves inside the scrollable region", () => {
    renderSummary({ draft: draftWithLines(3) });
    const region = screen.getByTestId("offer-summary-scroll-region");
    const firstItem = screen.getByText("Artikel 0");
    expect(region.contains(firstItem)).toBe(true);
  });

  it("only applies the scroll-affordance shadow/divider at lg:, and fills its workspace column's full height desktop-only", () => {
    renderSummary({ draft: draftWithLines(3), canPrepareInCore: true });
    const positionenLabel = screen.getByText(/^Positionen \(/);
    const footer = positionenLabel.closest(".shrink-0");
    expect(footer?.className).toMatch(/lg:shadow-/);

    const aside = footer?.closest("aside");
    // OFFER_PANE_FIXED_VIEWPORT_WORKSPACE_V1: the aside itself no longer
    // guesses its own height (no more sticky/max-h) — it just fills
    // whatever real fixed-height ancestor HomePage's workspace column
    // provides. `lg:min-h-0` is required so the flex-1 scroll region
    // below can actually shrink/scroll instead of forcing the aside
    // taller than that ancestor.
    expect(aside?.className).toMatch(/(?:^|\s)lg:h-full(?:\s|$)/);
    expect(aside?.className).toMatch(/(?:^|\s)lg:min-h-0(?:\s|$)/);
    expect(aside?.className).not.toMatch(/(?:^|\s)max-h-\[/);
    expect(aside?.className).not.toMatch(/sticky/);
  });

  it("mobile/tablet: nothing forces a cramped fixed-height inner scroller — summary flows naturally", () => {
    renderSummary({ draft: draftWithLines(6), canPrepareInCore: true });
    const region = screen.getByTestId("offer-summary-scroll-region");
    const aside = region.closest("aside");

    for (const el of [region, aside]) {
      const cls = el?.className ?? "";
      expect(cls).not.toMatch(/(?:^|\s)overflow-y-auto(?:\s|$)/);
      expect(cls).not.toMatch(/(?:^|\s)max-h-\[/);
      expect(cls).not.toMatch(/(?:^|\s)h-\[/);
    }
  });
});

/** Follow-up fix: the previous restructure still left the full VAT legal
 * paragraph permanently in the fixed footer, which — combined with 6+
 * lines — pushed "Angebot in Core vorbereiten" below the fold in real
 * production use even though it passed the earlier (lighter) test/manual
 * check. The paragraph is now collapsed by default behind a one-line
 * <details>/<summary> disclosure; the actual totals (Positionen, Pauschalen,
 * netto, VAT amounts, brutto) are never part of what's hidden. */
describe("OfferSummary — VAT notice disclosure", () => {
  function vatDetails(): HTMLDetailsElement {
    const summary = screen.getByText("MwSt.-Details");
    return summary.closest("details") as HTMLDetailsElement;
  }

  it("collapses the detailed VAT legal text by default", () => {
    // jsdom doesn't apply the browser's UA stylesheet that visually hides a
    // closed <details>'s children (it keeps them in the DOM either way, same
    // as a real browser) — `open` is the actual signal that drives that
    // hiding, so that's what this asserts.
    renderSummary({});
    const details = vatDetails();
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
  });

  it("expands to reveal the full legal wording when the summary is activated", () => {
    renderSummary({});
    const details = vatDetails();
    fireEvent.click(within(details).getByText("MwSt.-Details"));
    expect(details.open).toBe(true);
    expect(
      screen.getByText(/historische Leistungen werden nicht steuerlich bewertet/)
    ).toBeTruthy();
  });

  it("never hides the actual financial values behind the VAT disclosure", () => {
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
    renderSummary({ draft });
    const details = document.querySelector("details");
    // Positionen, Pauschalen and the netto/brutto totals must all be
    // findable while the disclosure is still closed.
    expect(details?.open).toBe(false);
    expect(screen.getByText(/^Positionen \(/)).toBeTruthy();
    expect(screen.getByText("Büffetpauschale")).toBeTruthy();
    expect(screen.getByText("Geschirr")).toBeTruthy();
    expect(screen.getByText(/Gesamt \(netto\)/)).toBeTruthy();
    expect(screen.getByText(/zzgl\. 7% MwSt\./)).toBeTruthy();
    expect(screen.getByText(/zzgl\. 19% MwSt\./)).toBeTruthy();
    expect(screen.getByText(/Gesamt \(brutto\)/)).toBeTruthy();
  });
});

describe("OfferSummary — multiple selected lines stay inside the scrollable region", () => {
  function draftWithLines(count: number): OfferDraft {
    const base = createInitialOfferDraft();
    return {
      ...base,
      lines: Array.from({ length: count }, (_, i) => ({
        lineId: `line-${i}`,
        itemId: `item-${i}`,
        quantityMode: "total" as const,
        quantity: 10,
        snapshot: {
          title: `Artikel ${i}`,
          source_type: "internal" as const,
          pricing_mode: "per_piece" as const,
          price_type: "piece" as const,
          chosen_price: 2.3,
          item_kind: "simple" as const,
        },
      })),
    };
  }

  it("keeps every selected line — not just the first — inside the scrollable region with 6 lines", () => {
    renderSummary({ draft: draftWithLines(6) });
    const region = screen.getByTestId("offer-summary-scroll-region");
    for (let i = 0; i < 6; i++) {
      expect(region.contains(screen.getByText(`Artikel ${i}`))).toBe(true);
    }
  });

  it("keeps both final action buttons outside the scrollable region even with 6 lines and the VAT notice open", () => {
    renderSummary({ draft: draftWithLines(6), canPrepareInCore: true });
    fireEvent.click(screen.getByText("MwSt.-Details"));
    fireEvent.click(screen.getByText("Weitere Aktionen"));
    const region = screen.getByTestId("offer-summary-scroll-region");
    const previewButton = screen.getByRole("button", { name: "Angebotsvorschau anzeigen" });
    const prepareButton = screen.getByRole("button", { name: "Angebot in Core vorbereiten" });
    expect(region.contains(previewButton)).toBe(false);
    expect(region.contains(prepareButton)).toBe(false);
  });
});

/** Split-screen mockup follow-up: secondary utilities (save draft,
 * exports) no longer sit inline in the scrollable region — they're
 * collapsed behind their own "Weitere Aktionen" disclosure in the fixed
 * footer, same pattern as the MwSt.-Details disclosure. */
describe("OfferSummary — secondary actions disclosure", () => {
  it("collapses save/export actions behind 'Weitere Aktionen' by default", () => {
    // Same jsdom caveat as the MwSt.-Details disclosure: it doesn't apply
    // the UA stylesheet that visually hides a closed <details>'s children,
    // so `open` is the signal that actually drives the hiding.
    renderSummary({});
    const summary = screen.getByText("Weitere Aktionen");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
  });

  it("reveals Entwurf speichern and the export actions when expanded", () => {
    renderSummary({});
    fireEvent.click(screen.getByText("Weitere Aktionen"));
    expect(screen.getByRole("button", { name: "Entwurf speichern" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export fürs Büro (JSON)" })).toBeTruthy();
  });
});

describe("OfferSummary — Budget stat card position", () => {
  it("shows the Budget/Aktuell/Verfügbar card in the fixed header, above the item list", () => {
    const draft: OfferDraft = { ...createInitialOfferDraft(), budgetEnabled: true, totalBudget: 1200 };
    renderSummary({ draft });
    const region = screen.getByTestId("offer-summary-scroll-region");
    const budgetLabel = screen.getByText("Budget");
    expect(region.contains(budgetLabel)).toBe(false);
  });

  it("shows the current position count next to the title", () => {
    const draft = draftFor(3);
    renderSummary({ draft });
    expect(screen.getByText("3 Positionen")).toBeTruthy();
  });
});

function draftFor(count: number): OfferDraft {
  const base = createInitialOfferDraft();
  return {
    ...base,
    lines: Array.from({ length: count }, (_, i) => ({
      lineId: `line-${i}`,
      itemId: `item-${i}`,
      quantityMode: "total" as const,
      quantity: 10,
      snapshot: {
        title: `Artikel ${i}`,
        source_type: "internal" as const,
        pricing_mode: "per_piece" as const,
        price_type: "piece" as const,
        chosen_price: 2.3,
        item_kind: "simple" as const,
      },
    })),
  };
}
