import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Card } from "../Card";

describe("Card", () => {
  it("renders eyebrow, title, subtitle and children when provided", () => {
    render(
      <Card eyebrow="Basisdaten" title="Auftragskontext" subtitle="Kernangaben">
        <p>Inhalt</p>
      </Card>
    );
    expect(screen.getByText("Basisdaten")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Auftragskontext" })).toBeTruthy();
    expect(screen.getByText("Kernangaben")).toBeTruthy();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });

  it("renders no header block when no header props are given", () => {
    const { container } = render(
      <Card>
        <p>Nur Inhalt</p>
      </Card>
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector(".border-b")).toBeNull();
  });

  it("renders a header action when provided", () => {
    render(
      <Card title="Titel" headerAction={<button type="button">Aktion</button>}>
        <p>Inhalt</p>
      </Card>
    );
    expect(screen.getByRole("button", { name: "Aktion" })).toBeTruthy();
  });
});
