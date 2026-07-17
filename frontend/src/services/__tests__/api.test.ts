import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchItems } from "../api";

describe("production API base", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses same-origin /api when VITE_API_URL is empty", async () => {
    vi.stubEnv("VITE_API_URL", "");
    const fetchMock = vi.fn(async (_url: string) => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchItems();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/items");
  });
});
