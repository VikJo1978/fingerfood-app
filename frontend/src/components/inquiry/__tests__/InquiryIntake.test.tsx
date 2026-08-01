import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { InquiryIntake } from "../InquiryIntake";

describe("InquiryIntake", () => {
  it("renders all existing inquiry fields inside the compact intake layout", () => {
    render(<InquiryIntake onPrepareOffer={vi.fn()} />);

    expect(screen.getByLabelText("Firma / Veranstalter")).toBeTruthy();
    expect(screen.getByLabelText("Ansprechpartner")).toBeTruthy();
    expect(screen.getByLabelText("E-Mail")).toBeTruthy();
    expect(screen.getByLabelText("Telefon")).toBeTruthy();
    expect(screen.getByLabelText("Datum")).toBeTruthy();
    expect(screen.getByLabelText("Uhrzeit (Orientierung)")).toBeTruthy();
    expect(screen.getByLabelText("Lieferadresse / Veranstaltungsort")).toBeTruthy();
    expect(screen.getByLabelText("Personen (erwartet)")).toBeTruthy();
    expect(screen.getByLabelText("Art der Veranstaltung")).toBeTruthy();
    expect(screen.getByLabelText("Service-Stil")).toBeTruthy();
    expect(screen.getByLabelText("Ernährung / Besonderheiten")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Angebot vorbereiten" })).toBeTruthy();
  });

  it("keeps the handoff payload unchanged while using the new layout", () => {
    const onPrepareOffer = vi.fn();
    render(<InquiryIntake onPrepareOffer={onPrepareOffer} />);

    fireEvent.change(screen.getByLabelText("Firma / Veranstalter"), {
      target: { value: "Musterfirma GmbH" },
    });
    fireEvent.change(screen.getByLabelText("Ansprechpartner"), {
      target: { value: "Erika Musterfrau" },
    });
    fireEvent.change(screen.getByLabelText("E-Mail"), {
      target: { value: "erika@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Telefon"), {
      target: { value: "+49301234567" },
    });
    fireEvent.change(screen.getByLabelText("Datum"), {
      target: { value: "2026-09-20" },
    });
    fireEvent.change(screen.getByLabelText("Uhrzeit (Orientierung)"), {
      target: { value: "18:30" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse / Veranstaltungsort"), {
      target: { value: "Musterstraße 1, 22549 Hamburg" },
    });
    fireEvent.change(screen.getByLabelText("Art der Veranstaltung"), {
      target: { value: "Hochzeit" },
    });
    fireEvent.change(screen.getByLabelText("Service-Stil"), {
      target: { value: "Buffet" },
    });
    fireEvent.change(screen.getByLabelText("Ernährung / Besonderheiten"), {
      target: { value: "Vegetarisch, keine Nuesse" },
    });

    fireEvent.click(screen.getByLabelText("Speisen"));
    fireEvent.click(screen.getByLabelText("Budgetrahmen angeben"));
    fireEvent.change(screen.getByLabelText("EUR gesamt (Orientierung)"), {
      target: { value: "1250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Angebot vorbereiten" }));

    expect(onPrepareOffer).toHaveBeenCalledWith({
      planning: {
        persons: 10,
        budget: 1250,
        budgetEnabled: true,
        desiredModules: ["food"],
        dietaryRequirements: "Vegetarisch, keine Nuesse",
        eventType: "Hochzeit",
        serviceStyle: "Buffet",
      },
      orderContextPrefill: {
        companyName: "Musterfirma GmbH",
        contactPerson: "Erika Musterfrau",
        email: "erika@example.invalid",
        phone: "+49301234567",
        eventDate: "2026-09-20",
        eventTime: "18:30",
        location: "Musterstraße 1, 22549 Hamburg",
        billingAddress: "",
        remarks: "Veranstaltungsart: Hochzeit\n\nService-Stil: Buffet\n\nVegetarisch, keine Nuesse",
      },
    });
  });

  it("uses a desktop-only second column and keeps the action button in a sticky workspace bar", () => {
    render(<InquiryIntake onPrepareOffer={vi.fn()} />);

    const layout = screen.getByTestId("inquiry-intake-layout");
    expect(layout.className).toContain("grid");
    expect(layout.className).not.toMatch(/(?:^|\s)grid-cols-\d/);
    expect(layout.className).toMatch(/xl:grid-cols-/);

    const actionBar = screen.getByTestId("inquiry-action-bar");
    expect(actionBar.className).toMatch(/(?:^|\s)sticky(?:\s|$)/);
    expect(actionBar.className).toMatch(/(?:^|\s)bottom-3(?:\s|$)/);
    expect(actionBar.className).not.toMatch(/overflow-x-auto/);
  });
});
