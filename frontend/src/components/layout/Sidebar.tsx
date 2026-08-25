import logo from "../../assets/silberloeffel-logo.jpg";

interface SidebarProps {
  onBack: () => void;
  activeLabel: string;
}

/**
 * Office-Panel-shell sidebar: fixed 248px rail on desktop (matching
 * .office-sidebar in silberloeffel-catering's OFFICE_PANEL_STYLE),
 * collapsing to a slim horizontal bar below `lg`. Only "Zurück zur
 * Anfrage" is a real destination — the Configurator has no other pages,
 * so no other Office Panel nav items are reproduced here (would be a
 * fabricated destination the app can't actually serve).
 */
export function Sidebar({ onBack, activeLabel }: SidebarProps) {
  return (
    <nav
      aria-label="Anwendungsnavigation"
      className="border-b border-line bg-white lg:sticky lg:top-0 lg:h-screen lg:w-[248px] lg:shrink-0 lg:border-b-0 lg:border-r"
    >
      {/* Mobile / tablet: compact horizontal bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
        <img src={logo} alt="Silberlöffel Event Catering Service" className="h-9 w-auto" />
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-bold text-muted transition hover:text-accent-deep"
        >
          <span aria-hidden="true">←</span> Zurück zur Anfrage
        </button>
      </div>

      {/* Desktop: full vertical nav rail */}
      <div className="hidden lg:flex lg:h-full lg:flex-col lg:px-[18px] lg:pb-5 lg:pt-6">
        <div className="mx-[10px] mb-7">
          <img
            src={logo}
            alt="Silberlöffel Event Catering Service"
            className="block h-auto w-[174px]"
          />
        </div>

        <p className="mx-3 mb-2 text-[10px] font-extrabold uppercase tracking-[.1em] text-muted">
          Navigation
        </p>
        <div className="grid gap-1">
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-[44px] items-center gap-[11px] rounded-[11px] px-3 py-2.5 text-left text-[15px] text-muted transition hover:bg-canvas hover:text-accent-deep"
          >
            <span aria-hidden="true">←</span> Zurück zur Anfrage
          </button>
          <span
            aria-current="page"
            className="flex min-h-[44px] items-center gap-[11px] rounded-[11px] bg-accent-soft px-3 py-2.5 text-[15px] font-semibold text-accent-deep"
          >
            {activeLabel}
          </span>
        </div>

        <div className="mt-auto border-t border-line pt-3.5 text-[11px] text-muted">
          <strong className="block text-xs text-ink">Konfigurator</strong>
          Angebot vorbereiten
        </div>
      </div>
    </nav>
  );
}
