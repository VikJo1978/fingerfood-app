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
    const view = render(
      <DeliveryFulfillmentSection charges={charges} onChange={onChange} />
    );

    fireEvent.change(screen.getByLabelText("Erfüllung"), {
      target: { value: "DELIVERY" },
    });
    fireEvent.change(screen.getByLabelText("Lieferadresse"), {
      target: { value: "SEPARATE" },
    });

    const streetFields = screen.getAllByLabelText("Straße / Hausnummer");
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
