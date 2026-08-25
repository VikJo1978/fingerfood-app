import { useMemo, useState } from "react";

import {
  ALLERGENS,
  ALLERGEN_LABELS_DE,
  DIET_LABELS_DE,
  DIET_TYPES,
  type AllergenCode,
  type DietType,
} from "../../constants/classification";
import {
  generateRecommendations,
  type FulfillmentMode,
  type RecommendationCateringFormat,
  type RecommendationEventType,
  type RecommendationGenerateResponse,
  type RecommendationVariant,
} from "../../services/recommendations";
import type { CatalogItem } from "../../types";
import { formatCurrency } from "../../utils/pricing";
import { WarningBanner } from "../ui/WarningBanner";

interface RecommendationPanelProps {
  eventDate: string;
  guestCount: number;
  catalog: CatalogItem[];
  inquiryId?: string | null;
  initialCateringFormat?: RecommendationCateringFormat;
  initialEventType?: RecommendationEventType | "";
  onApplyVariant?: (variant: RecommendationVariant) => void;
}

const fieldClass =
  "rounded-control border border-line bg-white px-3 py-2 text-sm text-ink transition focus:border-accent";
const labelClass = "text-[11px] font-extrabold uppercase tracking-[.05em] text-muted";

export function RecommendationPanel({
  eventDate,
  guestCount,
  catalog,
  inquiryId = null,
  initialCateringFormat = "fingerfood",
  initialEventType = "",
  onApplyVariant,
}: RecommendationPanelProps) {
  const [cateringFormat, setCateringFormat] =
    useState<RecommendationCateringFormat>(initialCateringFormat);
  const [eventType, setEventType] =
    useState<RecommendationEventType | "">(initialEventType);
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode>("DELIVERY");
  const [dietType, setDietType] = useState<DietType | "">("");
  const [noPork, setNoPork] = useState(false);
  const [useCustomerHistory, setUseCustomerHistory] = useState(true);
  const [excludedAllergens, setExcludedAllergens] = useState<AllergenCode[]>([]);
  const [preferredCategoriesRaw, setPreferredCategoriesRaw] = useState("");
  const [maxVariantNetEur, setMaxVariantNetEur] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendationGenerateResponse | null>(null);

  const itemNames = useMemo(
    () => Object.fromEntries(catalog.map((item) => [item.id, item.name])),
    [catalog]
  );

  function toggleAllergen(code: AllergenCode) {
    setExcludedAllergens((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    );
  }

  async function onGenerate() {
    if (!eventDate) {
      setErrorMessage("Bitte zuerst ein Eventdatum im Auftragskontext setzen.");
      setStatus("error");
      return;
    }
    if (guestCount <= 0) {
      setErrorMessage("Bitte zuerst eine gültige Personenzahl eintragen.");
      setStatus("error");
      return;
    }

    const preferredCategories = preferredCategoriesRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const parsedBudget = maxVariantNetEur.trim() === "" ? null : Number(maxVariantNetEur);
    if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      setErrorMessage("Das Netto-Budget muss eine gültige positive Zahl sein.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    try {
      const response = await generateRecommendations({
        event_date: eventDate,
        guest_count: guestCount,
        inquiry_id: inquiryId,
        use_customer_history: useCustomerHistory,
        event_type: eventType || null,
        catering_format: cateringFormat,
        fulfillment_mode: fulfillmentMode,
        diet_type: dietType || null,
        excluded_allergens: excludedAllergens,
        no_pork: noPork,
        preferred_categories: preferredCategories,
        max_variant_net_cents:
          parsedBudget === null ? null : Math.round(parsedBudget * guestCount * 100),
      });
      setResult(response);
      setStatus("idle");
    } catch {
      setResult(null);
      setStatus("error");
      setErrorMessage(
        "Vorschläge konnten nicht erzeugt werden. Katalog oder Produktionsdaten sind derzeit nicht verfügbar."
      );
    }
  }

  return (
    <section className="space-y-4 rounded-card border border-line bg-white p-5 shadow-card">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
          Caterer-Vorschlag
        </p>
        <h2 className="text-[17px] font-bold text-ink">Drei Angebotsvarianten erzeugen</h2>
        <p className="mt-1 text-sm text-muted">
          Deterministisch aus Kundenwunsch, aktuellem Katalog und Produktionsüberschneidung. Kein automatischer Versand.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Catering-Format</span>
          <select
            className={fieldClass}
            value={cateringFormat}
            onChange={(event) =>
              setCateringFormat(event.target.value as RecommendationCateringFormat)
            }
          >
            <option value="fingerfood">Fingerfood</option>
            <option value="buffet">Buffet</option>
            <option value="mixed">Gemischt</option>
            <option value="other">Sonstiges</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Veranstaltungstyp</span>
          <select
            className={fieldClass}
            value={eventType}
            onChange={(event) =>
              setEventType(event.target.value as RecommendationEventType | "")
            }
          >
            <option value="">Keine Vorgabe</option>
            <option value="business">Business / Meeting</option>
            <option value="private">Privat</option>
            <option value="wedding">Hochzeit</option>
            <option value="reception">Empfang</option>
            <option value="other">Sonstiges</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Erfüllung</span>
          <select
            className={fieldClass}
            value={fulfillmentMode}
            onChange={(event) => setFulfillmentMode(event.target.value as FulfillmentMode)}
          >
            <option value="DELIVERY">Lieferung</option>
            <option value="PICKUP">Abholung</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Ernährung</span>
          <select
            className={fieldClass}
            value={dietType}
            onChange={(event) => setDietType(event.target.value as DietType | "")}
          >
            <option value="">Keine Vorgabe</option>
            {DIET_TYPES.map((diet) => (
              <option key={diet} value={diet}>
                {DIET_LABELS_DE[diet]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Max. Netto-Budget / Person</span>
          <input
            className={fieldClass}
            type="number"
            min={0}
            step={10}
            placeholder="optional"
            value={maxVariantNetEur}
            onChange={(event) => setMaxVariantNetEur(event.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Bevorzugte Kategorien</span>
          <input
            className={fieldClass}
            value={preferredCategoriesRaw}
            onChange={(event) => setPreferredCategoriesRaw(event.target.value)}
            placeholder="z. B. Canapés, Dessert, Salate"
          />
        </label>
        <label className="inline-flex h-10 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={noPork}
            onChange={(event) => setNoPork(event.target.checked)}
            className="rounded border-line text-accent focus:ring-accent"
          />
          Kein Schweinefleisch
        </label>
      </div>

      {inquiryId ? (
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={useCustomerHistory}
            onChange={(event) => setUseCustomerHistory(event.target.checked)}
            className="rounded border-line text-accent focus:ring-accent"
          />
          Kundenhistorie als weichen Hinweis berücksichtigen
        </label>
      ) : null}

      <div>
        <span className={labelClass}>Ausschluss Allergene</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALLERGENS.map((code) => (
            <label
              key={code}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-ink"
            >
              <input
                type="checkbox"
                checked={excludedAllergens.includes(code)}
                onChange={() => toggleAllergen(code)}
                className="rounded border-line text-accent focus:ring-accent"
              />
              {ALLERGEN_LABELS_DE[code]}
            </label>
          ))}
        </div>
      </div>

      {errorMessage ? <WarningBanner tone="danger" message={errorMessage} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={status === "loading"}
          className="rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-wait disabled:opacity-60"
        >
          {status === "loading" ? "Vorschläge werden berechnet…" : "Vorschläge berechnen"}
        </button>
        <span className="text-xs text-muted">
          Event {eventDate || "noch offen"} · {guestCount} Gäste
        </span>
      </div>

      {result ? (
        <div className="space-y-3">
          {result.warnings.length > 0 ? (
            <WarningBanner message={result.warnings.join(" · ")} />
          ) : null}
          {result.variants.length === 0 ? (
            <WarningBanner message="Keine passende Variante innerhalb der gewählten Kriterien und des Budgets gefunden." />
          ) : null}
          {onApplyVariant && result.variants.length > 0 ? (
            <WarningBanner message="Beim Übernehmen einer Variante werden die aktuellen Angebotspositionen ersetzt. Auftragskontext, Personenzahl, Budget und Pauschalen bleiben erhalten." />
          ) : null}
          <div className="grid gap-3 xl:grid-cols-3">
            {result.variants.map((variant) => (
              <article key={variant.kind} className="rounded-card border border-line bg-canvas/40 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-bold text-ink">{variant.label}</h3>
                  <span className="text-sm font-bold text-ink">
                    {formatCurrency(variant.net_total_cents / 100)} netto
                  </span>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {variant.lines.map((line) => (
                    <li key={line.item_id} className="rounded-control bg-white px-3 py-2">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium text-ink">
                          {itemNames[line.item_id] ?? line.item_id}
                        </span>
                        <span className="whitespace-nowrap text-muted">× {line.quantity}</span>
                      </div>
                      {line.explanations.length > 0 ? (
                        <p className="mt-1 text-xs text-muted">{line.explanations.join(" · ")}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {variant.explanations.length > 0 ? (
                  <p className="mt-3 text-xs text-muted">{variant.explanations.join(" · ")}</p>
                ) : null}
                {onApplyVariant ? (
                  <button
                    type="button"
                    onClick={() => onApplyVariant(variant)}
                    className="mt-3 w-full rounded-control border border-accent bg-white px-3 py-2 text-sm font-bold text-accent-deep transition hover:bg-accent-soft"
                  >
                    Aktuelle Positionen durch Variante ersetzen
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          <p className="text-xs text-muted">
            Produktionssignale: {result.production_signal_count} · Historienhinweise: {result.customer_history_signal_count} · Katalog: {result.catalog_revision}
          </p>
        </div>
      ) : null}
    </section>
  );
}
