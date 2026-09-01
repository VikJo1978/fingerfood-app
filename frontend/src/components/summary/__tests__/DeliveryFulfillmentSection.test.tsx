import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createInitialChargesDefinition } from "../../../types";
import type { ChargesDefinition } from "../../../types";
import { DeliveryFulfillmentSection } from "../DeliveryFulfillmentSection";

function renderSection(initial: ChargesDefinition = createInitialChargesDefinition()) {
  let charges = initial;
  const view = render(
    <DeliveryFulfillmentSection
      charges={charges}
      onChange={(next) => {
        charges = next;
        view.rerender(
          <DeliveryFulfillmentSection
            charges={charges}
            onChange={(updated) => {
              charges = updated;
              view.rerender(
                <DeliveryFulfillmentSection charges={charges} onChange={() => undefined} />
              );
            }}
          />
        );
      }}
    />
  );
  return { current: () => charges, view };
}

describe("DeliveryFulfillmentSection", () => {
  it("starts unresolved and lets the operator choose pickup", () => {
    const state = renderSection();
    expect((screen.getByLabelText("Erfüllung") as HTMLSelectElement).value).toBe("UNKNOWN");

    fireEvent.change(screen.getByLabelText("Erfüllung"), {
      target: { value: "PICKUP" },
    });

    expect(state.current().delivery.fulfillment?.fulfillmentMode).toBe("PICKUP");
    expect(state.current().delivery.fulfillment?.deliveryAddressMode).toBe("UNKNOWN");
    expect(screen.getByText(/keine Lieferadresse erforderlich/i)).toBeTruthy();
  });

  it("shows Lieferadresse directly and defaults Rechnungsadresse to the same address", () => {
    const state = renderSection();

    fireEvent.change(screen.getByLabelText("Erfüllung"), {
      target: { value: "DELIVERY" },
    });

    expect(screen.getByText("Lieferadresse")).toBeTruthy();
    expect(
      screen.getByRole("checkbox", {
        name: "Rechnungsadresse weicht von Lieferadresse ab",
      })
    ).not.toBeChecked();
    expect(screen.queryByText(/^Rechnungsadresse$/)).toBeNull();
    expect(screen.getByText("Rechnungsadresse entspricht der Lieferadresse.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Lieferadresse Straße / Hausnummer"), {
      target: { value: "Eventweg 2" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse PLZ"), {
      target: { value: "20354" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse Ort"), {
      target: { value: "Hamburg" },
    });

    expect(state.current().delivery.fulfillment).toMatchObject({
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SAME_AS_INVOICE",
      invoiceAddress: {
        street: "Eventweg 2",
        postalCode: "20354",
        city: "Hamburg",
        country: "DE",
      },
    });
  });

  it("reveals a separate Rechnungsadresse without losing the Lieferadresse", () => {
    const state = renderSection();

    fireEvent.change(screen.getByLabelText("Erfüllung"), {
      target: { value: "DELIVERY" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse Straße / Hausnummer"), {
      target: { value: "Festplatz 3" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse PLZ"), {
      target: { value: "22765" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse Ort"), {
      target: { value: "Hamburg" },
    });

    const differs = screen.getByRole("checkbox", {
      name: "Rechnungsadresse weicht von Lieferadresse ab",
    });
    fireEvent.click(differs);

    expect(differs).toBeChecked();
    expect(screen.getByText(/^Rechnungsadresse$/)).toBeTruthy();
    expect((screen.getByLabelText("Lieferadresse Straße / Hausnummer") as HTMLInputElement).value).toBe(
      "Festplatz 3"
    );

    fireEvent.change(screen.getByLabelText("Rechnungsadresse Straße / Hausnummer"), {
      target: { value: "Rechnungsweg 7" },
    });

    expect(state.current().delivery.fulfillment).toMatchObject({
      deliveryAddressMode: "SEPARATE",
      deliveryAddress: {
        street: "Festplatz 3",
        postalCode: "22765",
        city: "Hamburg",
      },
      invoiceAddress: {
        street: "Rechnungsweg 7",
      },
    });

    fireEvent.click(differs);

    expect(
      screen.queryByRole("checkbox", {
        name: "Rechnungsadresse weicht von Lieferadresse ab",
        checked: true,
      })
    ).toBeNull();
    expect(screen.queryByText(/^Rechnungsadresse$/)).toBeNull();
    expect(state.current().delivery.fulfillment).toMatchObject({
      deliveryAddressMode: "SAME_AS_INVOICE",
      invoiceAddress: {
        street: "Festplatz 3",
        postalCode: "22765",
        city: "Hamburg",
      },
    });
  });

  it("renders an existing Core SEPARATE handoff in the same Office mental model", () => {
    const charges = createInitialChargesDefinition();
    charges.delivery.fulfillment = {
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SEPARATE",
      invoiceAddress: {
        street: "Rechnungsweg 7",
        postalCode: "22549",
        city: "Hamburg",
        country: "DE",
      },
      deliveryAddress: {
        street: "Festplatz 3",
        postalCode: "22765",
        city: "Hamburg",
        country: "DE",
      },
    };

    renderSection(charges);

    expect(
      screen.getByRole("checkbox", {
        name: "Rechnungsadresse weicht von Lieferadresse ab",
      })
    ).toBeChecked();
    expect((screen.getByLabelText("Lieferadresse Straße / Hausnummer") as HTMLInputElement).value).toBe(
      "Festplatz 3"
    );
    expect(
      (screen.getByLabelText("Rechnungsadresse Straße / Hausnummer") as HTMLInputElement).value
    ).toBe("Rechnungsweg 7");
  });
});
