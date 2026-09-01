/** Focused coverage for the imported-Inquiry context card after the visual
 * alignment pass: it must render through the shared Office-Panel-style Card
 * (eyebrow + title) and must surface the imported free-text Anfrage-Kontext,
 * without implying the customer has already been contacted. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { OrderContextCard } from "../OrderContextCard";
import { createInitialOrderContextV1 } from "../../types";

describe("OrderContextCard", () => {
  it("renders as an Office-Panel-style card with eyebrow and title", () => {
    render(
      <OrderContextCard
        orderContext={createInitialOrderContextV1()}
        onOrderContextChange={vi.fn()}
      />
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

  it("shows only the event venue here and does not duplicate the billing-address editor", () => {
    render(
      <OrderContextCard
        orderContext={{
          ...createInitialOrderContextV1(),
          location: "Hamburg Messe",
          billingAddress: "Legacy Rechnungsadresse 1",
        }}
        onOrderContextChange={vi.fn()}
      />
    );

    expect(screen.getByText("Veranstaltungsort")).toBeTruthy();
    expect(screen.getByDisplayValue("Hamburg Messe")).toBeTruthy();
    expect(screen.queryByText("Ort / Adresse")).toBeNull();
    expect(screen.queryByText("Rechnungsadresse")).toBeNull();
    expect(screen.queryByDisplayValue("Legacy Rechnungsadresse 1")).toBeNull();
  });

  it("keeps Zahlungsart out of the context card so it is not duplicated", () => {
    render(
      <OrderContextCard
        orderContext={{
          ...createInitialOrderContextV1(),
          companyName: "Musterfirma GmbH",
        }}
        onOrderContextChange={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Zahlungsart")).toBeNull();
  });

  it("shows only Datum, Lieferung and Beginn Veranstaltung for timing", () => {
    const onOrderContextChange = vi.fn();
    render(
      <OrderContextCard
        orderContext={{
          ...createInitialOrderContextV1(),
          eventDate: "2026-09-15",
          eventTime: "18:00",
          deliveryWindowStart: "16:30",
        }}
        onOrderContextChange={onOrderContextChange}
      />
    );

    expect(screen.getByDisplayValue("2026-09-15")).toBeTruthy();
    expect((screen.getByLabelText("Lieferung") as HTMLInputElement).value).toBe("16:30");
    expect((screen.getByLabelText("Beginn Veranstaltung") as HTMLInputElement).value).toBe("18:00");
    expect(screen.queryByText("Lieferfenster · Logistikplanung")).toBeNull();
    expect(screen.queryByLabelText("Lieferdatum Logistik")).toBeNull();
    expect(screen.queryByLabelText("Lieferfenster von")).toBeNull();
    expect(screen.queryByLabelText("Lieferfenster bis")).toBeNull();

    fireEvent.change(screen.getByLabelText("Lieferung"), { target: { value: "16:45" } });
    expect(onOrderContextChange).toHaveBeenCalledWith({ deliveryTime: "16:45" });

    fireEvent.change(screen.getByLabelText("Beginn Veranstaltung"), {
      target: { value: "18:15" },
    });
    expect(onOrderContextChange).toHaveBeenCalledWith({
      eventStart: "18:15",
      eventTime: "18:15",
    });
  });

  it("does not render the Anfrage-Kontext block when there are no remarks", () => {
    render(
      <OrderContextCard
        orderContext={createInitialOrderContextV1()}
        onOrderContextChange={vi.fn()}
      />
    );
    expect(screen.queryByText("Anfrage-Kontext")).toBeNull();
  });
});
