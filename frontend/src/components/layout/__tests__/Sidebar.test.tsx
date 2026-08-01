import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Sidebar } from "../Sidebar";

describe("Sidebar", () => {
  it("exposes a navigation landmark distinct from the Offer summary's complementary role", () => {
    render(<Sidebar onBack={vi.fn()} activeLabel="Angebot vorbereiten" />);
    expect(screen.getByRole("navigation", { name: "Anwendungsnavigation" })).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("shows the active section label, not as a link", () => {
    render(<Sidebar onBack={vi.fn()} activeLabel="Angebot vorbereiten" />);
    const active = screen.getAllByText("Angebot vorbereiten")[0];
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.tagName).not.toBe("A");
    expect(active.tagName).not.toBe("BUTTON");
  });

  it("calls onBack when 'Zurück zur Anfrage' is activated", () => {
    const onBack = vi.fn();
    render(<Sidebar onBack={onBack} activeLabel="Angebot vorbereiten" />);
    const backButtons = screen.getAllByRole("button", { name: /Zurück zur Anfrage/ });
    fireEvent.click(backButtons[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("does not render any fabricated Office Panel destinations", () => {
    render(<Sidebar onBack={vi.fn()} activeLabel="Angebot vorbereiten" />);
    // Only "Zurück zur Anfrage" and the active label should be present —
    // no Anfragen/Angebote/Kontakte/etc. links this app can't actually serve.
    expect(screen.queryByText("Anfragen")).toBeNull();
    expect(screen.queryByText("Angebote")).toBeNull();
    expect(screen.queryByText("Kontakte")).toBeNull();
  });

  it("supports an inquiry shell state with only the active destination visible", () => {
    render(
      <Sidebar
        activeLabel="Neue Anfrage erfassen"
        footerTitle="Anfrage"
        footerText="Neue Anfrage erfassen"
      />
    );

    expect(
      screen.getByText("Neue Anfrage erfassen", { selector: '[aria-current="page"]' })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Zurück zur Anfrage/ })).toBeNull();
  });
});
