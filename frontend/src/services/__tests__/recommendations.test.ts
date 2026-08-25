import { afterEach, describe, expect, it, vi } from "vitest";

import { generateRecommendations } from "../recommendations";

describe("recommendation API client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts the structured questionnaire to the same-origin BFF", async () => {
    vi.stubEnv("VITE_API_URL", "");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({
        event_date: "2026-08-30",
        guest_count: 40,
        catalog_revision: "core-catalog-v1",
        catalog_source: "catalog",
        warnings: [],
        production_signal_count: 2,
        customer_history_signal_count: 1,
        variants: [
          {
            kind: "ECONOMIC",
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
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateRecommendations({
      event_date: "2026-08-30",
      guest_count: 40,
      fulfillment_mode: "DELIVERY",
      no_pork: true,
      max_variant_net_cents: 50000,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ui/recommendations/generate");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      event_date: "2026-08-30",
      guest_count: 40,
      fulfillment_mode: "DELIVERY",
      no_pork: true,
      max_variant_net_cents: 50000,
    });
    expect(result.variants[0].lines[0].item_id).toBe("canape");
    expect(result.customer_history_signal_count).toBe(1);
  });

  it("fails closed when the BFF response shape is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ variants: [] })));

    await expect(
      generateRecommendations({
        event_date: "2026-08-30",
        guest_count: 10,
        fulfillment_mode: "PICKUP",
      })
    ).rejects.toThrow("recommendation_generate_invalid_response");
  });
});
