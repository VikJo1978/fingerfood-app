import type { OrderContextV1, PaymentMethod } from "../types";
import {
  allowedPaymentMethods,
  isCompanyCustomer,
  PAYMENT_METHOD_LABELS,
} from "../utils/paymentMethod";
import { Card } from "./ui/Card";

const inputClass =
  "w-full rounded-control border border-line bg-canvas/60 px-3 py-1.5 text-sm text-ink transition focus:border-accent focus:bg-white";

const fieldLabelClass = "text-[11px] font-extrabold uppercase tracking-[.05em] text-muted";
const canonicalLocalTimeRe = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function exactEventStart(orderContext: OrderContextV1): string {
  const explicit = orderContext.eventStart?.trim() ?? "";
  if (canonicalLocalTimeRe.test(explicit)) return explicit;
  const legacy = orderContext.eventTime.trim();
  if (canonicalLocalTimeRe.test(legacy)) return legacy;
  const legacyRangeStart = legacy.match(/^((?:[01]\d|2[0-3]):[0-5]\d)\s*[–-]/)?.[1];
  return legacyRangeStart ?? "";
}

function exactDeliveryTime(orderContext: OrderContextV1): string {
  const explicit = orderContext.deliveryTime?.trim() ?? "";
  if (canonicalLocalTimeRe.test(explicit)) return explicit;
  const legacy = orderContext.deliveryWindowStart?.trim() ?? "";
  return canonicalLocalTimeRe.test(legacy) ? legacy : "";
}

interface OrderContextCardProps {
  orderContext: OrderContextV1;
  paymentMethod?: PaymentMethod;
  onOrderContextChange: (patch: Partial<OrderContextV1>) => void;
  onPaymentMethodChange: (paymentMethod: PaymentMethod | undefined) => void;
}

export function OrderContextCard({
  orderContext,
  paymentMethod,
  onOrderContextChange,
  onPaymentMethodChange,
}: OrderContextCardProps) {
  const oc = orderContext;
  const companyCustomer = isCompanyCustomer(oc.companyName);
  const paymentMethods = allowedPaymentMethods(oc.companyName);

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
        <div className="grid gap-2.5 sm:col-span-2 sm:grid-cols-3 lg:col-span-3">
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
            <span className={fieldLabelClass}>Lieferung</span>
            <input
              aria-label="Lieferung"
              type="time"
              value={exactDeliveryTime(oc)}
              onChange={(e) =>
                onOrderContextChange({
                  deliveryTime: e.target.value || undefined,
                })
              }
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Beginn Veranstaltung</span>
            <input
              aria-label="Beginn Veranstaltung"
              type="time"
              value={exactEventStart(oc)}
              onChange={(e) =>
                onOrderContextChange({
                  eventStart: e.target.value || undefined,
                  eventTime: e.target.value,
                })
              }
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 rounded-control border border-line bg-canvas px-3 py-3">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Zahlungsart</span>
          <select
            aria-label="Zahlungsart"
            className={inputClass}
            value={paymentMethods.includes(paymentMethod as PaymentMethod) ? paymentMethod : ""}
            onChange={(e) =>
              onPaymentMethodChange(
                e.target.value === "" ? undefined : (e.target.value as PaymentMethod)
              )
            }
          >
            <option value="">Bitte wählen</option>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1.5 text-xs text-muted">
          {companyCustomer
            ? "Firmenkunde: Vorkasse, Rechnung oder Bar vor Ort."
            : "Privatkunde: Vorkasse oder Bar vor Ort. Rechnung ist nicht verfügbar."}
        </p>
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
