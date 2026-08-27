import type {
  ChargesDefinition,
  CustomerAddressInput,
  DeliveryFulfillmentDefinition,
  FulfillmentMode,
} from "../../types";
import { createInitialDeliveryFulfillmentDefinition } from "../../types";

interface DeliveryFulfillmentSectionProps {
  charges: ChargesDefinition;
  onChange: (charges: ChargesDefinition) => void;
}

const labelClass = "text-[11px] font-extrabold uppercase tracking-[.05em] text-muted";
const fieldClass =
  "w-full rounded-control border border-line bg-canvas/60 px-3 py-2 text-sm text-ink transition focus:border-accent focus:bg-white";
const selectClass =
  "w-full rounded-control border border-line bg-white px-3 py-2 text-sm text-ink transition focus:border-accent";

const COUNTRY_OPTIONS = [
  ["DE", "Deutschland"],
  ["AT", "Österreich"],
  ["CH", "Schweiz"],
  ["NL", "Niederlande"],
  ["BE", "Belgien"],
  ["LU", "Luxemburg"],
  ["FR", "Frankreich"],
  ["DK", "Dänemark"],
  ["PL", "Polen"],
  ["CZ", "Tschechien"],
  ["IT", "Italien"],
  ["ES", "Spanien"],
  ["PT", "Portugal"],
  ["SE", "Schweden"],
  ["NO", "Norwegen"],
  ["FI", "Finnland"],
  ["IE", "Irland"],
  ["GB", "Vereinigtes Königreich"],
  ["GR", "Griechenland"],
  ["HR", "Kroatien"],
  ["SI", "Slowenien"],
  ["SK", "Slowakei"],
  ["HU", "Ungarn"],
  ["RO", "Rumänien"],
  ["BG", "Bulgarien"],
  ["EE", "Estland"],
  ["LV", "Lettland"],
  ["LT", "Litauen"],
] as const;

const COUNTRY_CODES = new Set<string>(COUNTRY_OPTIONS.map(([code]) => code));
const OTHER_COUNTRY = "__OTHER__";

function fulfillment(charges: ChargesDefinition): DeliveryFulfillmentDefinition {
  return charges.delivery.fulfillment ?? createInitialDeliveryFulfillmentDefinition();
}

function setFulfillment(
  charges: ChargesDefinition,
  next: DeliveryFulfillmentDefinition
): ChargesDefinition {
  return {
    ...charges,
    delivery: {
      ...charges.delivery,
      fulfillment: next,
    },
  };
}

function setAddress(
  address: CustomerAddressInput,
  key: keyof CustomerAddressInput,
  value: string
): CustomerAddressInput {
  return { ...address, [key]: value };
}

function AddressFields({
  title,
  address,
  onChange,
}: {
  title: string;
  address: CustomerAddressInput;
  onChange: (address: CustomerAddressInput) => void;
}) {
  return (
    <fieldset className="grid gap-2 rounded-control border border-line bg-canvas/30 p-3">
      <legend className="px-1 text-xs font-bold text-ink">{title}</legend>
      <label className="grid gap-1">
        <span className={labelClass}>Straße / Hausnummer</span>
        <input
          className={fieldClass}
          value={address.street}
          onChange={(event) => onChange(setAddress(address, "street", event.target.value))}
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className="grid gap-1">
          <span className={labelClass}>PLZ</span>
          <input
            className={fieldClass}
            value={address.postalCode}
            onChange={(event) => onChange(setAddress(address, "postalCode", event.target.value))}
          />
        </label>
        <label className="grid gap-1">
          <span className={labelClass}>Ort</span>
          <input
            className={fieldClass}
            value={address.city}
            onChange={(event) => onChange(setAddress(address, "city", event.target.value))}
          />
        </label>
      </div>
      <label className="grid gap-1">
        <span className={labelClass}>Land</span>
        <select
          className={selectClass}
          value={COUNTRY_CODES.has(address.country) ? address.country : OTHER_COUNTRY}
          onChange={(event) =>
            onChange(
              setAddress(
                address,
                "country",
                event.target.value === OTHER_COUNTRY ? "" : event.target.value
              )
            )
          }
        >
          {COUNTRY_OPTIONS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
          <option value={OTHER_COUNTRY}>Anderes Land</option>
        </select>
      </label>
      {!COUNTRY_CODES.has(address.country) ? (
        <label className="grid gap-1">
          <span className={labelClass}>Anderes Land</span>
          <input
            className={fieldClass}
            value={address.country}
            onChange={(event) => onChange(setAddress(address, "country", event.target.value))}
            placeholder="Land eingeben"
          />
        </label>
      ) : null}
    </fieldset>
  );
}

export function DeliveryFulfillmentSection({ charges, onChange }: DeliveryFulfillmentSectionProps) {
  const current = fulfillment(charges);

  function changeMode(mode: FulfillmentMode) {
    onChange(
      setFulfillment(charges, {
        ...current,
        fulfillmentMode: mode,
        deliveryAddressMode: mode === "DELIVERY" ? current.deliveryAddressMode : "UNKNOWN",
      })
    );
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5">
        <span className={labelClass}>Erfüllung</span>
        <select
          className={selectClass}
          value={current.fulfillmentMode}
          onChange={(event) => changeMode(event.target.value as FulfillmentMode)}
        >
          <option value="UNKNOWN">Bitte wählen</option>
          <option value="PICKUP">Selbstabholung</option>
          <option value="DELIVERY">Lieferung</option>
        </select>
      </label>

      {current.fulfillmentMode === "UNKNOWN" ? (
        <p className="text-xs font-semibold text-danger" role="alert">
          Vor der Angebotsvorbereitung muss Lieferung oder Selbstabholung gewählt werden.
        </p>
      ) : null}

      {current.fulfillmentMode === "PICKUP" ? (
        <p className="rounded-control border border-line bg-canvas/50 px-3 py-2 text-sm text-muted">
          Selbstabholung: keine Lieferadresse erforderlich und keine Anliefergebühr.
        </p>
      ) : null}

      {current.fulfillmentMode === "DELIVERY" ? (
        <>
          <label className="grid gap-1.5">
            <span className={labelClass}>Lieferadresse</span>
            <select
              className={selectClass}
              value={current.deliveryAddressMode}
              onChange={(event) =>
                onChange(
                  setFulfillment(charges, {
                    ...current,
                    deliveryAddressMode: event.target
                      .value as DeliveryFulfillmentDefinition["deliveryAddressMode"],
                  })
                )
              }
            >
              <option value="UNKNOWN">Bitte wählen</option>
              <option value="SAME_AS_INVOICE">Wie Rechnungsadresse</option>
              <option value="SEPARATE">Abweichende Lieferadresse</option>
            </select>
          </label>

          <AddressFields
            title="Rechnungsadresse"
            address={current.invoiceAddress}
            onChange={(invoiceAddress) =>
              onChange(setFulfillment(charges, { ...current, invoiceAddress }))
            }
          />

          {current.deliveryAddressMode === "SEPARATE" ? (
            <AddressFields
              title="Lieferadresse"
              address={current.deliveryAddress}
              onChange={(deliveryAddress) =>
                onChange(setFulfillment(charges, { ...current, deliveryAddress }))
              }
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
