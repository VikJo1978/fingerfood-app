import { useMemo, useState } from "react";
import type { InquiryToConfiguratorTransferV1, ItemModule } from "../../types";

export interface InquiryIntakeProps {
  onPrepareOffer: (transfer: InquiryToConfiguratorTransferV1) => void;
}

type CriticalStatus = "offen" | "geklärt" | "nicht_relevant";

type AufwandKey =
  | "delivery_only"
  | "buffet_setup"
  | "beverage_setup"
  | "tableware_setup"
  | "equipment_setup"
  | "staff_briefing"
  | "allergen_signage"
  | "teardown_pickup"
  | "unclear";

const AUFWAND_OPTIONS: { key: AufwandKey; label: string }[] = [
  { key: "delivery_only", label: "nur Lieferung" },
  { key: "buffet_setup", label: "Buffet-Aufbau" },
  { key: "beverage_setup", label: "Getränke-Aufbau" },
  { key: "tableware_setup", label: "Geschirr-Aufbau" },
  { key: "equipment_setup", label: "Equipment / Tisch-Aufbau" },
  { key: "staff_briefing", label: "Personal-Einweisung" },
  { key: "allergen_signage", label: "Allergene / Hinweiskarten" },
  { key: "teardown_pickup", label: "Abbau / Abholung später" },
  { key: "unclear", label: "unklar" },
];

const MODULE_OPTIONS: { value: ItemModule; label: string }[] = [
  { value: "food", label: "Speisen" },
  { value: "beverage", label: "Getränke" },
  { value: "staff", label: "Personal" },
  { value: "tableware", label: "Geschirr" },
  { value: "equipment", label: "Equipment" },
];

const CRITICAL_ROWS: { id: string; label: string }[] = [
  { id: "allergens", label: "Allergene / Sonderkost" },
  { id: "access", label: "Zugang / Lieferzone" },
  { id: "timing", label: "Timing mit Küche / Location" },
  { id: "budget", label: "Budgetrahmen geklärt" },
];

const WEIGHT: Partial<Record<AufwandKey, number>> = {
  delivery_only: 1,
  staff_briefing: 1,
  allergen_signage: 1,
  beverage_setup: 2,
  tableware_setup: 2,
  teardown_pickup: 2,
  buffet_setup: 3,
  equipment_setup: 3,
};

function estimateVorlaufLabel(flags: Record<AufwandKey, boolean>): string {
  if (flags.unclear) return "intern prüfen";
  const active = AUFWAND_OPTIONS.filter((o) => o.key !== "unclear" && flags[o.key]).map((o) => o.key);
  if (active.length === 0) return "15–30 min";
  let score = 0;
  for (const k of active) {
    score += WEIGHT[k] ?? 1;
  }
  if (score <= 3) return "15–30 min";
  if (score <= 7) return "30–60 min";
  return "60–90 min";
}

function emptyFlags(): Record<AufwandKey, boolean> {
  return {
    delivery_only: false,
    buffet_setup: false,
    beverage_setup: false,
    tableware_setup: false,
    equipment_setup: false,
    staff_briefing: false,
    allergen_signage: false,
    teardown_pickup: false,
    unclear: false,
  };
}

function composeConfiguratorRemarks(p: {
  eventType: string;
  serviceStyle: string;
  dietaryRequirements: string;
}): string {
  const blocks: string[] = [];
  const et = p.eventType.trim();
  const ss = p.serviceStyle.trim();
  if (et) blocks.push(`Veranstaltungsart: ${et}`);
  if (ss) blocks.push(`Service-Stil: ${ss}`);
  const diet = p.dietaryRequirements.trim();
  if (diet) blocks.push(diet);
  return blocks.join("\n\n");
}

export function InquiryIntake({ onPrepareOffer }: InquiryIntakeProps) {
  const [company, setCompany] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [location, setLocation] = useState("");
  const [billingAddressDifferent, setBillingAddressDifferent] = useState(false);
  const [billingAddress, setBillingAddress] = useState("");
  const [billingEmailDifferent, setBillingEmailDifferent] = useState("");
  const [guestCount, setGuestCount] = useState(10);

  const [eventType, setEventType] = useState("");
  const [serviceStyle, setServiceStyle] = useState("");
  const [desiredModules, setDesiredModules] = useState<ItemModule[]>([]);
  const [dietaryRequirements, setDietaryRequirements] = useState("");

  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState(500);

  const [aufwandFlags, setAufwandFlags] = useState(emptyFlags);

  const [critical, setCritical] = useState<Record<string, CriticalStatus>>(() =>
    Object.fromEntries(CRITICAL_ROWS.map((r) => [r.id, "offen" as CriticalStatus]))
  );

  const vorlaufLabel = useMemo(() => estimateVorlaufLabel(aufwandFlags), [aufwandFlags]);

  const openCriticalRows = useMemo(
    () =>
      CRITICAL_ROWS.filter((row) => (critical[row.id] ?? "offen") === "offen"),
    [critical]
  );

  function toggleModule(m: ItemModule) {
    setDesiredModules((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }

  function toggleAufwand(key: AufwandKey) {
    setAufwandFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setCriticalStatus(id: string, status: CriticalStatus) {
    setCritical((prev) => ({ ...prev, [id]: status }));
  }

  function handlePrepare() {
    const transfer: InquiryToConfiguratorTransferV1 = {
      planning: {
        persons: Math.max(1, Math.round(guestCount) || 1),
        budget: budgetEnabled ? Math.max(0, budgetAmount) : null,
        budgetEnabled,
        desiredModules,
        dietaryRequirements: dietaryRequirements.trim(),
        eventType: eventType.trim(),
        serviceStyle: serviceStyle.trim(),
      },
      orderContextPrefill: {
        companyName: company.trim(),
        contactPerson: contactPerson.trim(),
        eventDate,
        eventTime: eventTime.trim(),
        location: location.trim(),
        remarks: composeConfiguratorRemarks({
          eventType,
          serviceStyle,
          dietaryRequirements,
        }),
      },
    };
    onPrepareOffer(transfer);
  }

  const blockClass = "space-y-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm";
  const labelClass = "text-xs font-medium uppercase tracking-wide text-slate-500";

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Erfassen Sie die Anfrage in Ruhe. Die Eingaben bleiben nur in diesem Fenster — es wird nichts
        zentral bei Kunden- oder Auftragsdaten abgelegt.
      </p>

      <section className={blockClass}>
        <h2 className="text-base font-semibold text-slate-900">Kontakt</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Firma / Veranstalter</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Ansprechpartner</span>
            <input
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>E-Mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Telefon</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <section className={blockClass}>
        <h2 className="text-base font-semibold text-slate-900">Veranstaltung</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Datum</span>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Uhrzeit (Orientierung)</span>
            <input
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              placeholder="z. B. 18:30"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={labelClass}>Lieferadresse / Veranstaltungsort</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-2 sm:col-span-2 text-sm">
            <input
              type="checkbox"
              checked={billingAddressDifferent}
              onChange={(e) => setBillingAddressDifferent(e.target.checked)}
              className="rounded border-slate-300"
            />
            Rechnungsadresse abweichend?
          </label>
          {billingAddressDifferent ? (
            <>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={labelClass}>Abweichende Rechnungsadresse</span>
                <textarea
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  rows={3}
                  placeholder="Name, Straße, PLZ Ort …"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={labelClass}>Rechnungs-E-Mail, falls abweichend</span>
                <input
                  type="email"
                  value={billingEmailDifferent}
                  onChange={(e) => setBillingEmailDifferent(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Personen (erwartet)</span>
            <input
              type="number"
              min={1}
              value={guestCount}
              onChange={(e) => setGuestCount(Number(e.target.value))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <section className={blockClass}>
        <h2 className="text-base font-semibold text-slate-900">Wunsch / Bedarf</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Art der Veranstaltung</span>
            <input
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="z. B. Firmenfeier, Hochzeit"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Service-Stil</span>
            <input
              value={serviceStyle}
              onChange={(e) => setServiceStyle(e.target.value)}
              placeholder="z. B. Flying Dinner, Buffet"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div>
          <span className={labelClass}>Gewünschte Module</span>
          <div className="mt-2 flex flex-wrap gap-3">
            {MODULE_OPTIONS.map(({ value, label }) => (
              <label key={value} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={desiredModules.includes(value)}
                  onChange={() => toggleModule(value)}
                  className="rounded border-slate-300"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Ernährung / Besonderheiten</span>
          <textarea
            value={dietaryRequirements}
            onChange={(e) => setDietaryRequirements(e.target.value)}
            rows={3}
            placeholder="Vegetarisch-Anteil, Allergien, keine Schweinefleisch-Gerichte …"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={budgetEnabled}
              onChange={(e) => setBudgetEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            Budgetrahmen angeben
          </label>
          {budgetEnabled ? (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>EUR gesamt (Orientierung)</span>
              <input
                type="number"
                min={0}
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(Number(e.target.value))}
                className="w-36 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className={blockClass}>
        <h2 className="text-base font-semibold text-slate-900">Zeit &amp; Ablauf / Aufwand vor Ort</h2>
        <p className="text-xs text-slate-500">
          Keine exakte Aufbauzeit erfassen — nur Komplexitäts-Hinweise für die spätere Planung.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {AUFWAND_OPTIONS.map(({ key, label }) => (
            <label key={key} className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={aufwandFlags[key]}
                onChange={() => toggleAufwand(key)}
                className="rounded border-slate-300"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
          <span className="font-medium">Geschätzter Vorlauf vor Essensbeginn: </span>
          <span>{vorlaufLabel}</span>
          <p className="mt-1 text-xs text-slate-500">
            Interne Schätzung. Finale Planung durch Küche / Disposition.
          </p>
        </div>
      </section>

      <section className={blockClass}>
        <h2 className="text-base font-semibold text-slate-900">Kritische Punkte</h2>
        <p className="text-xs text-slate-500">
          Nur zur Orientierung im Büro — ohne Anspruch auf Vollständigkeit für die spätere
          Auftragsbearbeitung.
        </p>
        <div className="space-y-2">
          {CRITICAL_ROWS.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm text-slate-800">{row.label}</span>
              <select
                value={critical[row.id] ?? "offen"}
                onChange={(e) => setCriticalStatus(row.id, e.target.value as CriticalStatus)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="offen">offen</option>
                <option value="geklärt">geklärt</option>
                <option value="nicht_relevant">nicht relevant</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className={blockClass}>
        <h2 className="text-base font-semibold text-slate-900">Nächster Schritt</h2>
        <p className="text-sm text-slate-600">
          Mit „Angebot vorbereiten“ wechseln Sie in den Konfigurator. Übernommen werden Firma,
          Ansprechpartner, Datum, Uhrzeit, Liefer-/Veranstaltungsort, Bemerkungen zu Veranstaltung und
          Ernährung (ohne Rechnungsdaten — diese bleiben hier im Formular), Personenzahl, Budget (falls
          aktiv) und ggf. ein einzelnes Katalog-Modul — nicht das gesamte Anfrage-Protokoll.
        </p>
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-3 text-sm text-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/90">Noch offen</p>
          {openCriticalRows.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
              {openCriticalRows.map((row) => (
                <li key={row.id}>{row.label}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-600">Alle kritischen Punkte sind markiert.</p>
          )}
        </div>
        <button
          type="button"
          onClick={handlePrepare}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Angebot vorbereiten
        </button>
      </section>
    </div>
  );
}
