import { useState } from "react";
import { listDrafts, type SavedOfferDraft } from "../../services/api";
import { formatDateDe } from "../../utils/formatDate";

interface SavedDraftBrowserProps {
  onOpenDraft: (id: string) => Promise<void>;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalDisplayString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function draftSummary(draft: SavedOfferDraft): {
  title: string;
  contact: string;
  persons: string;
} {
  const payload = isRecord(draft.payload) ? draft.payload : null;
  const orderContext = payload && isRecord(payload.orderContext) ? payload.orderContext : null;
  const company = optionalDisplayString(orderContext?.companyName);
  const contact = optionalDisplayString(orderContext?.contactPerson);
  const personsRaw = payload?.persons;
  const persons =
    typeof personsRaw === "number" && Number.isFinite(personsRaw) && personsRaw >= 0
      ? `${Math.round(personsRaw)} Personen`
      : "Personenzahl unbekannt";
  return {
    title: company || contact || `Entwurf ${draft.id.slice(0, 8)}`,
    contact: company && contact ? contact : "",
    persons,
  };
}

function updatedLabel(updatedAt: string): string {
  const datePart = updatedAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return formatDateDe(datePart);
  }
  return "Datum unbekannt";
}

export function SavedDraftBrowser({ onOpenDraft }: SavedDraftBrowserProps) {
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<SavedOfferDraft[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoadState("loading");
    setMessage(null);
    try {
      const loaded = await listDrafts();
      setDrafts([...loaded].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setLoadState("loaded");
    } catch (error) {
      setLoadState("error");
      setMessage(
        error instanceof Error ? error.message : "Entwürfe konnten nicht geladen werden."
      );
    }
  }

  async function toggle(): Promise<void> {
    const next = !expanded;
    setExpanded(next);
    if (next && loadState === "idle") {
      await load();
    }
  }

  async function openDraft(id: string): Promise<void> {
    setOpeningId(id);
    setMessage(null);
    try {
      await onOpenDraft(id);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Gespeicherter Entwurf konnte nicht geöffnet werden."
      );
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
            Gespeicherte Entwürfe
          </p>
          <p className="mt-1 text-sm text-muted">
            Bereits im Backend gespeicherte Konfigurator-Entwürfe wieder öffnen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          className="rounded-control border border-line bg-white px-3 py-2 text-sm font-bold text-accent-deep transition hover:border-accent hover:bg-accent-soft"
        >
          {expanded ? "Entwürfe ausblenden" : "Gespeicherte Entwürfe anzeigen"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={loadState === "loading"}
              onClick={() => void load()}
              className="text-xs font-bold text-accent-deep disabled:opacity-50"
            >
              Aktualisieren
            </button>
          </div>
          {loadState === "loading" ? (
            <p className="text-sm text-muted" role="status">
              Entwürfe werden geladen…
            </p>
          ) : null}
          {loadState === "loaded" && drafts.length === 0 ? (
            <p className="text-sm text-muted">Keine gespeicherten Entwürfe vorhanden.</p>
          ) : null}
          {drafts.map((draft) => {
            const summary = draftSummary(draft);
            return (
              <div
                key={draft.id}
                className="flex flex-col gap-3 rounded-control border border-line bg-canvas/30 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{summary.title}</p>
                  {summary.contact ? (
                    <p className="truncate text-xs text-muted">{summary.contact}</p>
                  ) : null}
                  <p className="text-xs text-muted">
                    {summary.persons} · geändert {updatedLabel(draft.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={openingId !== null}
                  onClick={() => void openDraft(draft.id)}
                  className="rounded-control bg-accent px-3 py-2 text-sm font-bold text-white transition hover:bg-accent-deep disabled:opacity-50"
                >
                  {openingId === draft.id ? "Öffnet…" : "Öffnen"}
                </button>
              </div>
            );
          })}
          {message ? (
            <p className="text-sm font-semibold text-danger" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
