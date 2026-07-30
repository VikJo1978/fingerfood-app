import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { WarningBanner } from "../WarningBanner";

describe("WarningBanner", () => {
  it("defaults to the warning tone with role=status", () => {
    render(<WarningBanner message="Bitte prüfen." />);
    const el = screen.getByRole("status");
    expect(el.textContent).toBe("Bitte prüfen.");
    expect(el.className).toContain("border-warning-border");
    expect(el.className).not.toContain("border-danger-border");
  });

  it("renders the danger tone with distinct styling when tone='danger'", () => {
    render(<WarningBanner tone="danger" message="Fehler." />);
    const el = screen.getByRole("status");
    expect(el.className).toContain("border-danger-border");
    expect(el.className).not.toContain("border-warning-border");
  });
});
