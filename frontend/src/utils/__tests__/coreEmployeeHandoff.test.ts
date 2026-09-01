import { describe, expect, it, vi } from "vitest";

import {
  clearActiveCoreHandoffContext,
  isBrowserReload,
  readActiveCoreHandoffContext,
  returnToCoreInquiry,
  writeActiveCoreHandoffContext,
} from "../coreEmployeeHandoff";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

describe("returnToCoreInquiry", () => {
  it("navigates through the trusted BFF context redirect and clears the reload marker", () => {
    const assign = vi.fn();
    const storage = memoryStorage();
    writeActiveCoreHandoffContext("trusted-context_123", storage);

    expect(returnToCoreInquiry("trusted-context_123", { assign }, storage)).toBe(true);
    expect(assign).toHaveBeenCalledWith("/api/ui/handoff/open-inquiry/trusted-context_123");
    expect(readActiveCoreHandoffContext(storage)).toBeNull();
  });

  it("rejects malformed context ids without navigating", () => {
    const assign = vi.fn();
    const storage = memoryStorage();

    expect(returnToCoreInquiry("../inquiry/other", { assign }, storage)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("active handoff reload marker", () => {
  it("stores only a validated context id and can clear it", () => {
    const storage = memoryStorage();

    writeActiveCoreHandoffContext("trusted-context_123", storage);
    expect(readActiveCoreHandoffContext(storage)).toBe("trusted-context_123");

    clearActiveCoreHandoffContext(storage);
    expect(readActiveCoreHandoffContext(storage)).toBeNull();
  });

  it("rejects malformed stored markers", () => {
    const storage = memoryStorage();
    storage.setItem("fingerfood.core-handoff-active-context.v1", JSON.stringify({
      schema_version: "fingerfood.core-handoff-active-context.v1",
      context_id: "../other",
    }));

    expect(readActiveCoreHandoffContext(storage)).toBeNull();
  });

  it("uses session fallback only for a real reload navigation", () => {
    const reloadPerformance = {
      getEntriesByType: () => [{ type: "reload" }],
    } as unknown as Pick<Performance, "getEntriesByType">;
    const navigatePerformance = {
      getEntriesByType: () => [{ type: "navigate" }],
    } as unknown as Pick<Performance, "getEntriesByType">;

    expect(isBrowserReload(reloadPerformance)).toBe(true);
    expect(isBrowserReload(navigatePerformance)).toBe(false);
  });
});
