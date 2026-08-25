import { useEffect, useState } from "react";

import { fetchItems } from "../../services/api";
import {
  recommendationCateringFormatFromServiceStyle,
  recommendationEventTypeFromInquiry,
  type RecommendationVariant,
} from "../../services/recommendations";
import type { CatalogItem } from "../../types";
import { RecommendationPanel } from "./RecommendationPanel";

interface RecommendationLauncherProps {
  initialEventDate?: string;
  initialGuestCount?: number;
  initialEventType?: string;
  initialServiceStyle?: string;
  inquiryId?: string | null;
  onApplyVariant?: (variant: RecommendationVariant) => void;
}

export function RecommendationLauncher({
  initialEventDate = "",
  initialGuestCount = 10,
  initialEventType = "",
  initialServiceStyle = "",
  inquiryId = null,
  onApplyVariant,
}: RecommendationLauncherProps) {
  const [open, setOpen] = useState(false);
  const [eventDate, setEventDate] = useState(initialEventDate);
  const [guestCount, setGuestCount] = useState(initialGuestCount);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  function openWithCurrentContext() {
    setEventDate(initialEventDate);
    setGuestCount(Math.min(5000, Math.max(1, Math.round(initialGuestCount) || 1)));
    setOpen(true);
  }

  useEffect(() => {
    if (!open || catalog.length > 0 || catalogError !== null) return;
    let cancelled = false;
    void fetchItems({})
      .then((items) => {
        if (!cancelled) setCatalog(items);
      })
      .catch(() => {
        if (!cancelled) setCatalogError("Katalog konnte nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, [catalog.length, catalogError, open]);

  const prefilledEventType = recommendationEventTypeFromInquiry(initialEventType);
  const prefilledCateringFormat =
    recommendationCateringFormatFromServiceStyle(initialServiceStyle) || "fingerfood";

  return (
    <>
      <button
        type="button"
        onClick={openWithCurrentContext}
        className="fixed bottom-5 left-5 z-40 rounded-full bg-accent px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-accent-deep"
      >
        Caterer-Vorschläge
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/35 p-4 sm:p-8" role="dialog" aria-modal="true">
          <div className="mx-auto max-w-6xl space-y-4 rounded-card bg-canvas p-4 shadow-xl sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-white p-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                  Office questionnaire
                </p>
                <h1 className="text-xl font-bold text-ink">Caterer-Vorschläge</h1>
                <p className="mt-1 text-sm text-muted">
                  Eventdaten setzen, Kriterien wählen und drei Varianten vergleichen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-control border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-accent"
              >
                Schließen
              </button>
            </div>

            <div className="grid gap-3 rounded-card border border-line bg-white p-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                  Eventdatum
                </span>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                  className="rounded-control border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                  Gäste
                </span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={guestCount}
                  onChange={(event) =>
                    setGuestCount(Math.min(5000, Math.max(1, Math.round(Number(event.target.value)) || 1)))
                  }
                  className="rounded-control border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent"
                />
              </label>
            </div>

            {catalogError ? (
              <p className="rounded-card border border-danger/30 bg-white p-4 text-sm font-semibold text-danger">
                {catalogError}
              </p>
            ) : (
              <RecommendationPanel
                eventDate={eventDate}
                guestCount={guestCount}
                catalog={catalog}
                inquiryId={inquiryId}
                initialEventType={prefilledEventType}
                initialCateringFormat={prefilledCateringFormat}
                onApplyVariant={(variant) => {
                  onApplyVariant?.(variant);
                  setOpen(false);
                }}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
