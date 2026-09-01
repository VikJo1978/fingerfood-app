import { describe, expect, it, vi } from "vitest";

import { returnToCoreInquiry } from "../coreEmployeeHandoff";

describe("returnToCoreInquiry", () => {
  it("navigates through the trusted BFF context redirect", () => {
    const assign = vi.fn();

    expect(returnToCoreInquiry("trusted-context_123", { assign })).toBe(true);
    expect(assign).toHaveBeenCalledWith(
      "/api/ui/handoff/open-inquiry/trusted-context_123"
    );
  });

  it("rejects malformed context ids without navigating", () => {
    const assign = vi.fn();

    expect(returnToCoreInquiry("../inquiry/other", { assign })).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
