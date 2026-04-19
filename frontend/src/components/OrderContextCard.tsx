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
            Uhrzeit
          </span>
          <input
            type="time"
            value={oc.eventTime}
            onChange={(e) => onOrderContextChange({ eventTime: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Bemerkungen <span className="font-normal normal-case text-slate-400">(optional)</span>
        </span>
        <textarea
          rows={2}
          value={oc.remarks ?? ""}
          onChange={(e) =>
            onOrderContextChange({
              remarks: e.target.value === "" ? undefined : e.target.value,
            })
          }
          className={`${inputClass} min-h-[4rem] resize-y`}
        />
      </label>
    </section>
  );
}
