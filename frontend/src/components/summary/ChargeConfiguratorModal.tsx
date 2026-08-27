import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  type ChargesDefinition,
  createInitialReturnLogisticsDefinition,
  type DishwareAdditionalLine,
} from "../../types";
import { formatCentsInput, parseGermanMoneyToCents } from "../../utils/money";
import { formatCurrency } from "../../utils/pricing";
import { IntegerField } from "../ui/IntegerField";
import { DeliveryFulfillmentSection } from "./DeliveryFulfillmentSection";

const DESCRIPTION_MAX = 500;

interface ChargeConfiguratorModalProps {
  open: boolean;
  charges: ChargesDefinition;
  persons: number;
  onClose: () => void;
  onChange: (charges: ChargesDefinition) => void;
  createLineId: () => string;
}

const labelClass = "text-[11px] font-extrabold uppercase tracking-[.05em] text-muted";
const moneyClass =
  "w-full rounded-control border border-line bg-canvas/60 px-3 py-2 text-sm text-ink transition focus:border-accent focus:bg-white";
const selectClass =
  "rounded-control border border-line bg-white px-3 py-2 text-sm text-ink transition focus:border-accent";
const stepperClass =
  "flex w-9 items-center justify-center rounded-control border border-line bg-white text-ink transition hover:border-accent hover:bg-accent-soft";

function validPersons(persons: number): boolean {
  return Number.isInteger(persons) && persons > 0;
}

function setLine(
  charges: ChargesDefinition,
  lineId: string,
  patch: Partial<DishwareAdditionalLine>
): ChargesDefinition {
  return {
    ...charges,
    dishware: {
      ...charges.dishware,
      additionalLines: charges.dishware.additionalLines.map((line) =>
        line.lineId === lineId ? { ...line, ...patch } : line
      ),
    },
  };
}

function MoneyField({
  label,
  valueCents,
  onValidChange,
}: {
  label: string;
  valueCents: number;
  onValidChange: (cents: number) => void;
}) {
  const [text, setText] = useState(formatCentsInput(valueCents));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(formatCentsInput(valueCents));
    setError(null);
  }, [valueCents]);

  function commit(raw: string) {
    const parsed = parseGermanMoneyToCents(raw);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    setText(formatCentsInput(parsed.cents));
    onValidChange(parsed.cents);
  }

  return (
    <label className="grid gap-1.5">
      <span className={labelClass}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseGermanMoneyToCents(e.target.value);
          if (parsed.ok) {
            setError(null);
            onValidChange(parsed.cents);
          } else {
            setError(parsed.message);
          }
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
        className={moneyClass}
      />
      {error ? (
        <span className="text-xs font-semibold text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function ChargeConfiguratorModal({
  open,
  charges,
  persons,
  onClose,
  onChange,
  createLineId,
}: ChargeConfiguratorModalProps) {
  if (!open) return null;

  const hasPersons = validPersons(persons);
  const returnLogistics = charges.returnLogistics ?? createInitialReturnLogisticsDefinition();
  const buffetTotal =
    charges.buffet.baseMode === "PAUSCHALE" && hasPersons
      ? charges.buffet.pauschalePerPersonCents * persons
      : 0;
  const dishwarePauschaleTotal =
    charges.dishware.baseMode === "PAUSCHALE" && hasPersons
      ? charges.dishware.pauschalePerPersonCents * persons
      : 0;

  return createPortal(
    <div
      data-testid="charge-configurator-overlay"
      className="fixed inset-0 z-[110] overflow-y-auto overscroll-contain bg-ink/50 p-4"
      onClick={onClose}
    >
      <div
        className="mx-auto flex w-full max-w-2xl flex-col rounded-card border border-line bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Pauschalen & Lieferung"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 rounded-t-card border-b border-line bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Pauschalen & Lieferung</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
          >
            Schließen
          </button>
        </div>

        <div data-testid="charge-configurator-content" className="space-y-5 px-5 py-4">
          <section className="grid gap-3 border-b border-line pb-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="grid gap-1.5">
                <span className={labelClass}>Büffetpauschale</span>
                <select
                  value={charges.buffet.baseMode}
                  onChange={(e) =>
                    onChange({
                      ...charges,
                      buffet: {
                        ...charges.buffet,
                        baseMode: e.target.value as ChargesDefinition["buffet"]["baseMode"],
                      },
                    })
                  }
                  className={selectClass}
                >
                  <option value="NONE">Keine</option>
                  <option value="PAUSCHALE">Pauschale</option>
                </select>
              </label>
              <div className="text-right text-sm">
                <span className="block text-muted">Summe</span>
                <strong className="text-ink">{formatCurrency(buffetTotal / 100)}</strong>
              </div>
            </div>
            <MoneyField
              label="Netto pro Person"
              valueCents={charges.buffet.pauschalePerPersonCents}
              onValidChange={(cents) =>
                onChange({
                  ...charges,
                  buffet: { ...charges.buffet, pauschalePerPersonCents: cents },
                })
              }
            />
            {charges.buffet.baseMode === "PAUSCHALE" && !hasPersons ? (
              <p className="text-xs font-semibold text-danger" role="alert">
                Büffetpauschale benötigt eine gültige Personenzahl.
              </p>
            ) : null}
          </section>

          <section className="grid gap-3 border-b border-line pb-5">
            <DeliveryFulfillmentSection charges={charges} onChange={onChange} />
            <MoneyField
              label="Anlieferung netto"
              valueCents={charges.delivery.amountCents}
              onValidChange={(cents) =>
                onChange({
                  ...charges,
                  delivery: { ...charges.delivery, amountCents: cents },
                })
              }
            />
            {charges.delivery.fulfillment?.fulfillmentMode === "PICKUP" ? (
              <p className="text-xs text-muted">
                Bei Selbstabholung bleibt der hinterlegte Lieferpreis erhalten, wird aber nicht
                berechnet.
              </p>
            ) : null}
          </section>

          <section className="grid gap-3 border-b border-line pb-5">
            <label className="grid gap-1.5">
              <span className={labelClass}>Rückholung</span>
              <select
                aria-label="Rückholmodus"
                value={returnLogistics.mode}
                onChange={(e) => {
                  const mode = e.target.value as typeof returnLogistics.mode;
                  onChange({
                    ...charges,
                    returnLogistics: {
                      ...returnLogistics,
                      mode,
                      pickupWindowText:
                        mode === "SAME_DAY" ? returnLogistics.pickupWindowText : null,
                      pickupWindowStartLocal:
                        mode === "SAME_DAY" ? returnLogistics.pickupWindowStartLocal : undefined,
                      pickupWindowEndLocal:
                        mode === "SAME_DAY" ? returnLogistics.pickupWindowEndLocal : undefined,
                    },
                  });
                }}
                className={selectClass}
              >
                <option value="NEXT_WORKING_DAY">Nächster Werktag</option>
                <option value="SAME_DAY">Am Veranstaltungstag</option>
              </select>
            </label>
            {returnLogistics.mode === "SAME_DAY" ? (
              <>
                <label className="grid gap-1.5">
                  <span className={labelClass}>Abholfenster</span>
                  <input
                    aria-label="Abholfenster Rückholung"
                    type="text"
                    maxLength={DESCRIPTION_MAX}
                    placeholder="z. B. 22:00–23:00"
                    value={returnLogistics.pickupWindowText ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...charges,
                        returnLogistics: {
                          ...returnLogistics,
                          pickupWindowText: e.target.value.slice(0, DESCRIPTION_MAX),
                        },
                      })
                    }
                    onBlur={(e) =>
                      onChange({
                        ...charges,
                        returnLogistics: {
                          ...returnLogistics,
                          pickupWindowText: e.currentTarget.value.trim() || null,
                        },
                      })
                    }
                    className={moneyClass}
                  />
                  {returnLogistics.pickupWindowText?.trim() ? null : (
                    <span className="text-xs font-semibold text-danger" role="alert">
                      Abholfenster für Rückholung am Veranstaltungstag erforderlich.
                    </span>
                  )}
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className={labelClass}>Abholung von · optional</span>
                    <input
                      aria-label="Abholung Rückholung von"
                      type="time"
                      value={returnLogistics.pickupWindowStartLocal ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...charges,
                          returnLogistics: {
                            ...returnLogistics,
                            pickupWindowStartLocal: e.target.value || undefined,
                          },
                        })
                      }
                      className={moneyClass}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className={labelClass}>Abholung bis · optional</span>
                    <input
                      aria-label="Abholung Rückholung bis"
                      type="time"
                      value={returnLogistics.pickupWindowEndLocal ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...charges,
                          returnLogistics: {
                            ...returnLogistics,
                            pickupWindowEndLocal: e.target.value || undefined,
                          },
                        })
                      }
                      className={moneyClass}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted">
                  Die strukturierte Von/Bis-Zeit ist nur für die Logistik-Kapazitätsplanung. Leer
                  bedeutet: Zeitpunkt noch unbekannt.
                </p>
                <MoneyField
                  label="Aufpreis Rückholung netto"
                  valueCents={returnLogistics.sameDayFeeCents}
                  onValidChange={(sameDayFeeCents) =>
                    onChange({
                      ...charges,
                      returnLogistics: { ...returnLogistics, sameDayFeeCents },
                    })
                  }
                />
                <p className="text-xs text-muted">
                  Die Rückholung am selben Tag wird als eigene Position im Angebot berechnet.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted">
                Rückholung am nächsten Werktag ist durch den normalen Liefer-/Servicetarif
                abgedeckt.
              </p>
            )}
          </section>

          <section className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="grid gap-1.5">
                <span className={labelClass}>Geschirr</span>
                <select
                  value={charges.dishware.baseMode}
                  onChange={(e) =>
                    onChange({
                      ...charges,
                      dishware: {
                        ...charges.dishware,
                        baseMode: e.target.value as ChargesDefinition["dishware"]["baseMode"],
                      },
                    })
                  }
                  className={selectClass}
                >
                  <option value="NONE">Kein Geschirr</option>
                  <option value="PAUSCHALE">Pauschale</option>
                </select>
              </label>
              <div className="text-right text-sm">
                <span className="block text-muted">Pauschale</span>
                <strong className="text-ink">{formatCurrency(dishwarePauschaleTotal / 100)}</strong>
              </div>
            </div>
            <MoneyField
              label="Netto pro Person"
              valueCents={charges.dishware.pauschalePerPersonCents}
              onValidChange={(cents) =>
                onChange({
                  ...charges,
                  dishware: {
                    ...charges.dishware,
                    pauschalePerPersonCents: cents,
                  },
                })
              }
            />
            {charges.dishware.baseMode === "PAUSCHALE" && !hasPersons ? (
              <p className="text-xs font-semibold text-danger" role="alert">
                Geschirrpauschale benötigt eine gültige Personenzahl.
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className={labelClass}>Zusätzliche Geschirrpositionen</span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...charges,
                    dishware: {
                      ...charges.dishware,
                      additionalLines: [
                        ...charges.dishware.additionalLines,
                        {
                          lineId: createLineId(),
                          description: "Zusatzgeschirr",
                          quantity: 1,
                          unitNetCents: 0,
                        },
                      ],
                    },
                  })
                }
                className="rounded-control border border-accent bg-white px-3 py-1.5 text-sm font-bold text-accent-deep transition hover:bg-accent-soft"
              >
                Position hinzufügen
              </button>
            </div>

            {charges.dishware.additionalLines.length === 0 ? (
              <p className="rounded-control border border-dashed border-line bg-canvas/60 px-3 py-3 text-sm text-muted">
                Keine zusätzlichen Geschirrpositionen.
              </p>
            ) : (
              <ul className="space-y-3">
                {charges.dishware.additionalLines.map((line) => (
                  <li key={line.lineId} className="rounded-control border border-line p-3">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_10rem]">
                      <label className="grid gap-1.5">
                        <span className={labelClass}>Beschreibung</span>
                        <input
                          type="text"
                          maxLength={DESCRIPTION_MAX}
                          value={line.description}
                          onChange={(e) => {
                            const description = e.target.value.trim().slice(0, DESCRIPTION_MAX);
                            onChange(setLine(charges, line.lineId, { description }));
                          }}
                          onBlur={(e) => {
                            const description = e.currentTarget.value.trim();
                            if (description)
                              onChange(setLine(charges, line.lineId, { description }));
                          }}
                          className={moneyClass}
                        />
                        {line.description.trim() === "" ? (
                          <span className="text-xs font-semibold text-danger" role="alert">
                            Beschreibung erforderlich.
                          </span>
                        ) : null}
                      </label>
                      <label className="grid gap-1.5">
                        <span className={labelClass}>Anzahl</span>
                        <IntegerField
                          value={line.quantity}
                          onChange={(quantity) =>
                            onChange(setLine(charges, line.lineId, { quantity }))
                          }
                          min={1}
                          max={5000}
                          aria-label={`Anzahl ${line.description || "Geschirrposition"}`}
                          inputClassName={moneyClass}
                          stepperClassName={stepperClass}
                        />
                      </label>
                      <MoneyField
                        label="Netto-Einzelpreis"
                        valueCents={line.unitNetCents}
                        onValidChange={(unitNetCents) =>
                          onChange(setLine(charges, line.lineId, { unitNetCents }))
                        }
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted">
                        Summe: {formatCurrency((line.quantity * line.unitNetCents) / 100)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...charges,
                            dishware: {
                              ...charges.dishware,
                              additionalLines: charges.dishware.additionalLines.filter(
                                (candidate) => candidate.lineId !== line.lineId
                              ),
                            },
                          })
                        }
                        className="rounded-control border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink transition hover:border-danger hover:text-danger"
                      >
                        Entfernen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
