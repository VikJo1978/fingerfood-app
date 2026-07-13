import type { OrderContextV1 } from "../types";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 outline-none ring-accent/30 transition focus:border-accent focus:bg-white focus:ring-2";

interface OrderContextCardProps {
  orderContext: OrderContextV1;
  onOrderContextChange: (patch: Partial<OrderContextV1>) => void;
}

export function OrderContextCard({
  orderContext,
  onOrderContextChange,
}: OrderContextCardProps) {
  const oc = orderContext;

  const remarksTrimmed = (oc.remarks ?? "").trim();
  const inquiryContextBlocks = remarksTrimmed
    ? remarksTrimmed.split(/\n\n+/).map((b) => b.trim()).filter(Boolean)
    : [];

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      <h2 className="text-sm font-semibold text-slate-900">Basisdaten · Auftragskontext</h2>
      <p className="mt-1 text-xs text-slate-500">
        Kernangaben zur Veranstaltung — lokal im Entwurf, ohne Speicherung.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Firma / Organisation
          </span>
          <input
            type="text"
            autoComplete="organization"
            value={oc.companyName}
            onChange={(e) => onOrderContextChange({ companyName: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            E-Mail
          </span>
          <input
            type="email"
            autoComplete="email"
            value={oc.email ?? ""}
            onChange={(e) => onOrderContextChange({ email: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Telefon
          </span>
          <input
            type="tel"
            autoComplete="tel"
            value={oc.phone ?? ""}
            onChange={(e) => onOrderContextChange({ phone: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ansprechpartner
          </span>
          <input
            type="text"
            autoComplete="name"
            value={oc.contactPerson}
            onChange={(e) => onOrderContextChange({ contactPerson: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ort / Adresse
          </span>
          <input
            type="text"
            value={oc.location}
            onChange={(e) => onOrderContextChange({ location: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Datum
          </span>
          <input
            type="date"
            value={oc.eventDate}
            onChange={(e) => onOrderContextChange({ eventDate: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Uhrzeit / Zeitfenster
          </span>
          <input
            type="text"
            placeholder="z. B. 18:30–23:00 oder abends"
            value={oc.eventTime}
            onChange={(e) => onOrderContextChange({ eventTime: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      {oc.billingAddress?.trim() ? (
        <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-900">
            ⚠ Achtung: abweichender Lieferort — Rechnungsadresse ≠ Lieferadresse!
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Lieferung geht an „Ort / Adresse" oben, NICHT an die Rechnungsadresse unten. Bitte
            beim Fahrer/Küche gesondert hervorheben.
          </p>
        </div>
      ) : null}

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Rechnungsadresse{" "}
          <span className="font-normal normal-case text-slate-400">
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
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Anfrage-Kontext
          </span>
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2.5 shadow-sm">
            <div className="space-y-2">
              {inquiryContextBlocks.map((block, i) => (
                <p
                  key={i}
                  className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800"
                >
                  {block}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Bemerkungen <span className="font-normal normal-case text-slate-400">(optional)</span>
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
    </section>
  );
}
