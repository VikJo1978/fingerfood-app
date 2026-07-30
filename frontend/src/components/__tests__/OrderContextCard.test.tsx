/** Focused coverage for the imported-Inquiry context card after the visual
 * alignment pass: it must render through the shared Office-Panel-style Card
 * (eyebrow + title) and must surface the imported free-text Anfrage-Kontext,
 * without implying the customer has already been contacted. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { OrderContextCard } from "../OrderContextCard";
import { createInitialOrderContextV1 } from "../../types";

describe("OrderContextCard", () => {
  it("renders as an Office-Panel-style card with eyebrow and title", () => {
    render(
      <OrderContextCard orderContext={createInitialOrderContextV1()} onOrderContextChange={vi.fn()} />
    );
    expect(screen.getByText("Basisdaten")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Auftragskontext" })).toBeTruthy();
  });

  it("shows imported free-text Anfrage-Kontext from the Inquiry handoff", () => {
    render(
      <OrderContextCard
        orderContext={{
          ...createInitialOrderContextV1(),
          companyName: "Musterfirma GmbH",
          remarks: "Betreff: Firmenjubiläum\n\nWunsch: 40 Personen, Buffet",
        }}
        onOrderContextChange={vi.fn()}
      />
    );
    expect(screen.getByText("Anfrage-Kontext")).toBeTruthy();
    expect(screen.getByText("Betreff: Firmenjubiläum")).toBeTruthy();
    expect(screen.getByText("Wunsch: 40 Personen, Buffet")).toBeTruthy();
    expect(screen.getByDisplayValue("Musterfirma GmbH")).toBeTruthy();
  });

  it("does not render the Anfrage-Kontext block when there are no remarks", () => {
    render(
      <OrderContextCard orderContext={createInitialOrderContextV1()} onOrderContextChange={vi.fn()} />
    );
    expect(screen.queryByText("Anfrage-Kontext")).toBeNull();
  });
});
