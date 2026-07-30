import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { InquiryHeroCard } from "../InquiryHeroCard";

describe("InquiryHeroCard", () => {
  it("renders eyebrow, title, facts and the Aktueller-Stand panel from the given values", () => {
    render(
      <InquiryHeroCard
        eyebrow="Angebot vorbereiten"
        title="Hochzeit"
        facts={["31.07.2026", "Brooksheide 3, 22549 Hamburg", "ca. 30 Gäste"]}
        stateTitle="Angebot zusammenstellen"
        stateDescription="Entwurf — noch kein Auftrag."
      />
    );
    expect(screen.getByText("Angebot vorbereiten")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hochzeit" })).toBeTruthy();
    expect(screen.getByText("31.07.2026")).toBeTruthy();
    expect(screen.getByText("Brooksheide 3, 22549 Hamburg")).toBeTruthy();
    expect(screen.getByText("ca. 30 Gäste")).toBeTruthy();
    expect(screen.getByText("Aktueller Stand")).toBeTruthy();
    expect(screen.getByText("Angebot zusammenstellen")).toBeTruthy();
    expect(screen.getByText("Entwurf — noch kein Auftrag.")).toBeTruthy();
  });

  it("omits empty facts instead of rendering blank entries", () => {
    render(
      <InquiryHeroCard
        eyebrow="Angebot vorbereiten"
        title="Catering-Anfrage"
        facts={["", "  ", "ca. 10 Gäste"]}
        stateTitle="Angebot zusammenstellen"
      />
    );
    const factsRow = screen.getByText("ca. 10 Gäste").parentElement;
    expect(factsRow?.children.length).toBe(1);
  });

  it("renders no facts row at all when every fact is empty", () => {
    render(
      <InquiryHeroCard
        eyebrow="Angebot vorbereiten"
        title="Catering-Anfrage"
        facts={["", ""]}
        stateTitle="Angebot zusammenstellen"
      />
    );
    expect(screen.getByRole("heading", { name: "Catering-Anfrage" })).toBeTruthy();
    // No stray empty fact wrapper in the DOM.
    expect(document.querySelector(".flex-wrap")).toBeNull();
  });
});
