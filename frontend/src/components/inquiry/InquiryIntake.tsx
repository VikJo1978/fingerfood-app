import { useMemo, useState } from "react";
import type { InquiryToConfiguratorTransferV1, ItemModule } from "../../types";
import { IntegerField } from "../ui/IntegerField";

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
        email: email.trim(),
        phone: phone.trim(),
        eventDate,
        eventTime: eventTime.trim(),
        location: location.trim(),
        billingAddress: billingAddressDifferent ? billingAddress.trim() : "",
        remarks: composeConfiguratorRemarks({
          eventType,
          serviceStyle,
          dietaryRequirements,
        }),
      },
    };
    onPrepareOffer(transfer);
  }

  const blockClass = "space-y-4 rounded-card border border-line bg-white p-5 shadow-card";
  const labelClass = "text-[11px] font-extrabold uppercase tracking-[.05em] text-muted";

  return (
    <div className="space-y-6" data-testid="inquiry-intake-root">
      <section className="rounded-card border border-line bg-accent-soft/70 px-5 py-4 text-sm text-ink shadow-card">
        Erfassen Sie die Anfrage in Ruhe. Die Eingaben bleiben nur in diesem Fenster; es wird
        nichts zentral bei Kunden- oder Auftragsdaten abgelegt.
      </section>

      <div
        className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.85fr)]"
        data-testid="inquiry-intake-layout"
      >
        <div className="grid min-w-0 content-start gap-6">
          <section className={blockClass}>
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                Kontakt
              </p>
              <h2 className="text-[18px] font-bold text-ink">Anfragebasis</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Firma / Veranstalter</span>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Ansprechpartner</span>
                <input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>E-Mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Telefon</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
            </div>
          </section>

          <section className={blockClass}>
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                Veranstaltung
              </p>
              <h2 className="text-[18px] font-bold text-ink">Termin und Rahmen</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Datum</span>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Uhrzeit (Orientierung)</span>
                <input
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  placeholder="z. B. 18:30"
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={labelClass}>Lieferadresse / Veranstaltungsort</span>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Personen (erwartet)</span>
                <IntegerField
                  value={guestCount}
                  onChange={setGuestCount}
                  min={1}
                  aria-label="Personen (erwartet)"
                  inputClassName="w-full min-w-[5rem] rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                  stepperClassName="flex w-8 items-center justify-center rounded-control border border-line text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
                />
              </label>
              <div className="grid content-start gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={billingAddressDifferent}
                    onChange={(e) => setBillingAddressDifferent(e.target.checked)}
                    className="rounded border-line text-accent focus:ring-accent"
                  />
                  Rechnungsadresse abweichend?
                </label>
              </div>
              {billingAddressDifferent ? (
                <>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className={labelClass}>Abweichende Rechnungsadresse</span>
                    <textarea
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                      rows={3}
                      placeholder="Name, Straße, PLZ Ort …"
                      className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                    />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className={labelClass}>Rechnungs-E-Mail, falls abweichend</span>
                    <input
                      type="email"
                      value={billingEmailDifferent}
                      onChange={(e) => setBillingEmailDifferent(e.target.value)}
                      className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                    />
                  </label>
                </>
              ) : null}
            </div>
          </section>

          <section className={blockClass}>
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                Bedarf
              </p>
              <h2 className="text-[18px] font-bold text-ink">Planung und Catering</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Art der Veranstaltung</span>
                <input
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  placeholder="z. B. Firmenfeier, Hochzeit"
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Service-Stil</span>
                <input
                  value={serviceStyle}
                  onChange={(e) => setServiceStyle(e.target.value)}
                  placeholder="z. B. Flying Dinner, Buffet"
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <div className="sm:col-span-2">
                <span className={labelClass}>Gewünschte Module</span>
                <div className="mt-2 flex flex-wrap gap-3">
                  {MODULE_OPTIONS.map(({ value, label }) => (
                    <label
                      key={value}
                      className="inline-flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={desiredModules.includes(value)}
                        onChange={() => toggleModule(value)}
                        className="rounded border-line text-accent focus:ring-accent"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={labelClass}>Ernährung / Besonderheiten</span>
                <textarea
                  value={dietaryRequirements}
                  onChange={(e) => setDietaryRequirements(e.target.value)}
                  rows={3}
                  placeholder="Vegetarisch-Anteil, Allergien, keine Schweinefleisch-Gerichte …"
                  className="rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                />
              </label>
              <div className="flex flex-wrap items-end gap-4 sm:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={budgetEnabled}
                    onChange={(e) => setBudgetEnabled(e.target.checked)}
                    className="rounded border-line text-accent focus:ring-accent"
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
                      className="w-36 rounded-control border border-line px-3 py-2 text-sm focus:border-accent"
                    />
                  </label>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <section className={blockClass}>
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                Ablauf
              </p>
              <h2 className="text-[18px] font-bold text-ink">Zeit und Aufwand vor Ort</h2>
            </div>
            <p className="text-xs text-muted">
              Keine exakte Aufbauzeit erfassen, nur Komplexitäts-Hinweise für die spätere Planung.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {AUFWAND_OPTIONS.map(({ key, label }) => (
                <label key={key} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={aufwandFlags[key]}
                    onChange={() => toggleAufwand(key)}
                    className="rounded border-line text-accent focus:ring-accent"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="rounded-control border border-dashed border-line bg-canvas/60 px-3 py-2 text-sm text-ink">
              <span className="font-medium">Geschätzter Vorlauf vor Essensbeginn: </span>
              <span>{vorlaufLabel}</span>
              <p className="mt-1 text-xs text-muted">
                Interne Schätzung. Finale Planung durch Küche / Disposition.
              </p>
            </div>
          </section>

          <section className={blockClass}>
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                Kritische Punkte
              </p>
              <h2 className="text-[18px] font-bold text-ink">Abstimmungen im Blick</h2>
            </div>
            <p className="text-xs text-muted">
              Nur zur Orientierung im Büro, ohne Anspruch auf Vollständigkeit für die spätere
              Auftragsbearbeitung.
            </p>
            <div className="space-y-2">
              {CRITICAL_ROWS.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-control border border-line bg-canvas/60 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_168px] sm:items-center"
                >
                  <span className="min-w-0 text-sm text-ink">{row.label}</span>
                  <select
                    value={critical[row.id] ?? "offen"}
                    onChange={(e) => setCriticalStatus(row.id, e.target.value as CriticalStatus)}
                    className="rounded-control border border-line bg-white px-2 py-1.5 text-sm focus:border-accent"
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
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                Übergabe
              </p>
              <h2 className="text-[18px] font-bold text-ink">Was in den Konfigurator geht</h2>
            </div>
            <p className="text-sm text-muted">
              Übernommen werden Firma, Ansprechpartner, Datum, Uhrzeit,
              Liefer-/Veranstaltungsort, Bemerkungen zu Veranstaltung und Ernährung,
              Personenzahl, Budget und gegebenenfalls ein einzelnes Modul.
            </p>
          </section>
        </div>
      </div>

      <section
        className="sticky bottom-3 z-10 rounded-card border border-line bg-white/96 px-4 py-4 shadow-[0_14px_34px_rgba(27,38,31,0.12)] backdrop-blur"
        data-testid="inquiry-action-bar"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-warning">
              Offene Punkte
            </p>
            {openCriticalRows.length > 0 ? (
              <>
                <p className="text-sm font-semibold text-ink">
                  {openCriticalRows.length} Punkte noch offen
                </p>
                <p className="text-sm text-muted">
                  {openCriticalRows.map((row) => row.label).join(" · ")}
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-ink">
                Alle kritischen Punkte sind markiert.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrepare}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-control bg-accent px-6 text-sm font-bold text-white shadow-sm transition hover:bg-accent-deep"
          >
            Angebot vorbereiten
          </button>
        </div>
      </section>
    </div>
  );
}
