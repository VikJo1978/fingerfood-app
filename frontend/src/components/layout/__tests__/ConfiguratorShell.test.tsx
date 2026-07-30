import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ConfiguratorShell } from "../ConfiguratorShell";

describe("ConfiguratorShell", () => {
  it("renders the sidebar, top-bar crumb and children together, and wires the back link", () => {
    const onBack = vi.fn();
    render(
      <ConfiguratorShell onBack={onBack} crumb="Hochzeit">
        <p>Inhalt</p>
      </ConfiguratorShell>
    );
    expect(screen.getByRole("navigation", { name: "Anwendungsnavigation" })).toBeTruthy();
    expect(screen.getByText("Hochzeit")).toBeTruthy();
    expect(screen.getByText("Inhalt")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /Zurück zur Anfrage/ })[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("uses a mobile-first shell grid that only splits into sidebar + content from lg: up", () => {
    const { container } = render(
      <ConfiguratorShell onBack={vi.fn()} crumb="Hochzeit">
        <p>Inhalt</p>
      </ConfiguratorShell>
    );
    const root = container.firstElementChild;
    expect(root?.className).not.toMatch(/(?:^|\s)grid-cols-\d/);
    expect(root?.className).toMatch(/lg:grid-cols-\[248px/);
  });
});
