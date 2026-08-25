import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recommendationCateringFormatFromServiceStyle,
  recommendationEventTypeFromInquiry,
} from "../../../services/recommendations";
import type { CatalogItem } from "../../../types";
import { RecommendationPanel } from "../RecommendationPanel";

const { generateRecommendationsMock } = vi.hoisted(() => ({
  generateRecommendationsMock: vi.fn(),
}));

vi.mock("../../../services/recommendations", async () => {
  const actual = await vi.importActual<typeof import("../../../services/recommendations")>(
    "../../../services/recommendations"
  );
  return {
    ...actual,
    generateRecommendations: generateRecommendationsMock,
  };
});

const catalog: CatalogItem[] = [
  {
    id: "canape",
    name: "Canapé Auswahl",
    section: "Fingerfood",
    category: "Canapés",
    price: 6,
    price_type: "piece",
    min_order: 10,
    unit_label: "Stück",
    description: "Testposition",
    module: "food",
    source_type: "internal",
    item_kind: "simple",
    pricing_mode: "per_piece",
    customization_mode: "fixed",
  },
];

const variant = {
  kind: "ECONOMIC" as const,
  label: "Wirtschaftlich",
  net_total_cents: 24000,
  explanations: ["deterministic economic assembly"],
  lines: [
    {
      item_id: "canape",
      quantity: 40,
      unit_net_cents: 600,
      net_total_cents: 24000,
      score: 42,
      explanations: ["confirmed production overlap"],
    },
  ],
};

describe("RecommendationPanel variant apply", () => {
  beforeEach(() => {
    generateRecommendationsMock.mockReset();
    generateRecommendationsMock.mockResolvedValue({
      event_date: "2026-08-30",
      guest_count: 40,
      catalog_revision: "core-catalog-v1",
      catalog_source: "catalog",
      warnings: [],
      production_signal_count: 2,
      customer_history_signal_count: 1,
      variants: [variant],
    });
  });

  it("states replacement semantics and forwards the selected variant", async () => {
    const onApplyVariant = vi.fn();
    render(
      <RecommendationPanel
        eventDate="2026-08-30"
        guestCount={40}
        catalog={catalog}
        onApplyVariant={onApplyVariant}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Vorschläge berechnen" }));

    const applyButton = await screen.findByRole("button", {
      name: "Aktuelle Positionen durch Variante ersetzen",
    });
    expect(
      screen.getByText(
        "Beim Übernehmen einer Variante werden die aktuellen Angebotspositionen ersetzt. Auftragskontext, Personenzahl, Budget und Pauschalen bleiben erhalten."
      )
    ).toBeTruthy();

    fireEvent.click(applyButton);

    await waitFor(() => expect(onApplyVariant).toHaveBeenCalledOnce());
    expect(onApplyVariant).toHaveBeenCalledWith(variant);
  });

  it("sends catering format and event type to deterministic scoring", async () => {
    render(<RecommendationPanel eventDate="2026-08-30" guestCount={40} catalog={catalog} />);

    fireEvent.change(screen.getByLabelText("Catering-Format"), {
      target: { value: "buffet" },
    });
    fireEvent.change(screen.getByLabelText("Veranstaltungstyp"), {
      target: { value: "business" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vorschläge berechnen" }));

    await waitFor(() => expect(generateRecommendationsMock).toHaveBeenCalledOnce());
    expect(generateRecommendationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        catering_format: "buffet",
        event_type: "business",
      })
    );
  });

  it("lets Office disable history hints without deleting history", async () => {
    render(
      <RecommendationPanel
        eventDate="2026-08-30"
        guestCount={40}
        catalog={catalog}
        inquiryId="inquiry-1"
      />
    );

    const historyToggle = screen.getByLabelText(
      "Kundenhistorie als weichen Hinweis berücksichtigen"
    );
    expect((historyToggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(historyToggle);
    fireEvent.click(screen.getByRole("button", { name: "Vorschläge berechnen" }));

    await waitFor(() => expect(generateRecommendationsMock).toHaveBeenCalledOnce());
    expect(generateRecommendationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inquiry_id: "inquiry-1",
        use_customer_history: false,
      })
    );
  });

  it("uses structured prefill without requiring duplicate input", async () => {
    render(
      <RecommendationPanel
        eventDate="2026-08-30"
        guestCount={40}
        catalog={catalog}
        initialCateringFormat="buffet"
        initialEventType="wedding"
      />
    );

    expect((screen.getByLabelText("Catering-Format") as HTMLSelectElement).value).toBe("buffet");
    expect((screen.getByLabelText("Veranstaltungstyp") as HTMLSelectElement).value).toBe("wedding");

    fireEvent.click(screen.getByRole("button", { name: "Vorschläge berechnen" }));

    await waitFor(() => expect(generateRecommendationsMock).toHaveBeenCalledOnce());
    expect(generateRecommendationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        catering_format: "buffet",
        event_type: "wedding",
      })
    );
  });

  it("normalizes only known inquiry wording and leaves unknown text neutral", () => {
    expect(recommendationEventTypeFromInquiry("Firmenfeier")).toBe("business");
    expect(recommendationEventTypeFromInquiry("Hochzeit")).toBe("wedding");
    expect(recommendationEventTypeFromInquiry("Empfang im Rathaus")).toBe("reception");
    expect(recommendationEventTypeFromInquiry("Kundenspezifischer Anlass")).toBe("");

    expect(recommendationCateringFormatFromServiceStyle("Buffet")).toBe("buffet");
    expect(recommendationCateringFormatFromServiceStyle("Flying Dinner")).toBe("fingerfood");
    expect(recommendationCateringFormatFromServiceStyle("Fingerfood + Buffet")).toBe("mixed");
    expect(recommendationCateringFormatFromServiceStyle("Service nach Absprache")).toBe("");
  });
});
