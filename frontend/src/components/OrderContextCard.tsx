import type { OrderContextV1 } from "../types";
import { Card } from "./ui/Card";

const inputClass =
  "w-full rounded-control border border-line bg-canvas/60 px-3 py-1.5 text-sm text-ink transition focus:border-accent focus:bg-white";

const fieldLabelClass = "text-[11px] font-extrabold uppercase tracking-[.05em] text-muted";

interface OrderContextCardProps {
  orderContext: OrderContextV1;
  onOrderContextChange: (patch: Partial<OrderContextV1>) => void;
}

export function OrderContextCard({ orderContext, onOrderContextChange }: OrderContextCardProps) {
  const oc = orderContext;

  const remarksTrimmed = (oc.remarks ?? "").trim();
  const inquiryContextBlocks = remarksTrimmed
    ? remarksTrimmed
        .split(/\n\n+/)
        .map((b) => b.trim())
        .filter(Boolean)
    : [];

  return (
    <Card eyebrow="Basisdaten" title="Auftragskontext">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Firma / Organisation</span>
          <input
            type="text"
            autoComplete="organization"
            value={oc.companyName}
            onChange={(e) => onOrderContextChange({ companyName: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>E-Mail</span>
          <input
            type="email"
            autoComplete="email"
            value={oc.email ?? ""}
            onChange={(e) => onOrderContextChange({ email: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Telefon</span>
          <input
            type="tel"
            autoComplete="tel"
            value={oc.phone ?? ""}
            onChange={(e) => onOrderContextChange({ phone: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Ansprechpartner</span>
          <input
            type="text"
            autoComplete="name"
            value={oc.contactPerson}
            onChange={(e) => onOrderContextChange({ contactPerson: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Ort / Adresse</span>
          <input
            type="text"
            value={oc.location}
            onChange={(e) => onOrderContextChange({ location: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Datum</span>
          <input
            type="date"
            value={oc.eventDate}
            onChange={(e) => onOrderContextChange({ eventDate: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Uhrzeit / Zeitfenster</span>
          <input
            type="text"
            placeholder="z. B. 18:30–23:00 oder abends"
            value={oc.eventTime}
            onChange={(e) => onOrderContextChange({ eventTime: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 rounded-control border border-line bg-canvas px-3 py-3">
        <div className="mb-2">
          <span className={fieldLabelClass}>Lieferfenster · Logistikplanung</span>
          <p className="mt-1 text-xs text-muted">
            Strukturierte Zeitangabe für die Kapazitätsplanung. Leer lassen, wenn noch nicht
            festgelegt. Das freie Feld „Uhrzeit / Zeitfenster“ oben wird daraus nicht automatisch
            abgeleitet.
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Lieferdatum</span>
            <input
              aria-label="Lieferdatum Logistik"
              type="date"
              value={oc.deliveryDate ?? ""}
              onChange={(e) =>
                onOrderContextChange({
                  deliveryDate: e.target.value || undefined,
                })
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Von</span>
            <input
              aria-label="Lieferfenster von"
              type="time"
              value={oc.deliveryWindowStart ?? ""}
              onChange={(e) =>
                onOrderContextChange({
                  deliveryWindowStart: e.target.value || undefined,
                })
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Bis</span>
            <input
              aria-label="Lieferfenster bis"
              type="time"
              value={oc.deliveryWindowEnd ?? ""}
              onChange={(e) =>
                onOrderContextChange({
                  deliveryWindowEnd: e.target.value || undefined,
                })
              }
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {oc.billingAddress?.trim() ? (
        <div className="mt-3 rounded-control border border-warning-border bg-warning-soft px-4 py-3">
          <p className="text-sm font-bold text-warning">
            ⚠ Achtung: abweichender Lieferort — Rechnungsadresse ≠ Lieferadresse!
          </p>
          <p className="mt-1 text-xs text-warning">
            Lieferung geht an „Ort / Adresse&quot; oben, NICHT an die Rechnungsadresse unten. Bitte
            beim Fahrer/Küche gesondert hervorheben.
          </p>
        </div>
      ) : null}

      <label className="mt-3 flex flex-col gap-1.5">
        <span className={fieldLabelClass}>
          Rechnungsadresse{" "}
          <span className="font-normal normal-case text-muted">
            (nur ausfüllen, falls abweichend von Ort / Adresse)
          </span>
        </span>
        <input
          type="text"
          value={oc.billingAddress ?? ""}
          onChange={(e) =>
            onOrderContextChange({
              billingAddress: e.target.value === "" ? undefined : e.target.value,
            })
          }
          className={inputClass}
        />
      </label>

      {inquiryContextBlocks.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Anfrage-Kontext</span>
          <div className="rounded-control border border-line bg-canvas px-3 py-2.5">
            <div className="space-y-2">
              {inquiryContextBlocks.map((block, i) => (
                <p
                  key={i}
                  className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink"
                >
                  {block}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <label className="mt-3 flex flex-col gap-1.5">
        <span className={fieldLabelClass}>
          Bemerkungen <span className="font-normal normal-case text-muted">(optional)</span>
        </span>
        <textarea
          rows={3}
          value={oc.remarks ?? ""}
          onChange={(e) =>
            onOrderContextChange({
              remarks: e.target.value === "" ? undefined : e.target.value,
            })
          }
          className={`${inputClass} min-h-[5.5rem] resize-y`}
        />
      </label>
    </Card>
  );
}
