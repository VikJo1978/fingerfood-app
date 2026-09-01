import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createInitialChargesDefinition } from "../../../types";
import type { ChargesDefinition } from "../../../types";
import { DeliveryFulfillmentSection } from "../DeliveryFulfillmentSection";

function renderSection() {
  let charges = createInitialChargesDefinition();
  const { rerender } = render(
    <DeliveryFulfillmentSection
      charges={charges}
      onChange={(next) => {
        charges = next;
        rerender(
          <DeliveryFulfillmentSection
            charges={charges}
            onChange={(updated) => {
              charges = updated;
            }}
          />
        );
      }}
    />
  );
  return { current: () => charges };
}

describe("DeliveryFulfillmentSection", () => {
  it("hides customer address fields until the delivery source is selected", () => {
    renderSection();

    fireEvent.change(screen.getByLabelText("Erfüllung"), {
      target: { value: "DELIVERY" },
    });

    expect(screen.getByLabelText("Lieferadresse verwenden")).toBeTruthy();
    expect(screen.queryByText("Rechnungsadresse")).toBeNull();
    expect(screen.queryByLabelText("Straße / Hausnummer")).toBeNull();
  });

  it("shows only Rechnungsadresse for Wie Rechnungsadresse", () => {
    const state = renderSection();

    fireEvent.change(screen.getByLabelText("Erfüllung"), {
      target: { value: "DELIVERY" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse verwenden"), {
      target: { value: "SAME_AS_INVOICE" },
    });

    expect(screen.getByText("Rechnungsadresse")).toBeTruthy();
    expect(screen.queryByText(/^Lieferadresse$/)).toBeTruthy();
    expect(screen.getAllByLabelText("Straße / Hausnummer")).toHaveLength(1);

    const countrySelect = screen.getByLabelText("Land") as HTMLSelectElement;
    expect(countrySelect.value).toBe("DE");
    fireEvent.change(countrySelect, { target: { value: "AT" } });
    expect(state.current().delivery.fulfillment?.invoiceAddress.country).toBe("AT");
  });

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

  it("collects a separate delivery address for delivery", () => {
    let charges: ChargesDefinition = createInitialChargesDefinition();
    const onChange = (next: ChargesDefinition) => {
      charges = next;
      view.rerender(<DeliveryFulfillmentSection charges={charges} onChange={onChange} />);
    };
    const view = render(<DeliveryFulfillmentSection charges={charges} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Erfüllung"), {
      target: { value: "DELIVERY" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse"), {
      target: { value: "SEPARATE" },
    });

    expect(screen.getAllByText("Rechnungsadresse")).toHaveLength(1);
    expect(screen.getAllByText("Lieferadresse")).toHaveLength(2);

    const streetFields = screen.getAllByLabelText("Straße / Hausnummer");
    expect(streetFields).toHaveLength(2);
    fireEvent.change(streetFields[1], { target: { value: "Eventweg 2" } });
    const postalFields = screen.getAllByLabelText("PLZ");
    fireEvent.change(postalFields[1], { target: { value: "20354" } });
    const cityFields = screen.getAllByLabelText("Ort");
    fireEvent.change(cityFields[1], { target: { value: "Hamburg" } });

    expect(charges.delivery.fulfillment).toMatchObject({
      fulfillmentMode: "DELIVERY",
      deliveryAddressMode: "SEPARATE",
      deliveryAddress: {
        street: "Eventweg 2",
        postalCode: "20354",
        city: "Hamburg",
      },
    });
  });
});
