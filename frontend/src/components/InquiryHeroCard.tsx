interface InquiryHeroCardProps {
  eyebrow: string;
  title: string;
  facts: string[];
  stateTitle: string;
  stateDescription?: string;
}

/**
 * Office-Panel-style green Inquiry hero (mirrors .inquiry-hero /
 * .inquiry-eyebrow / .inquiry-hero-facts / .inquiry-state-panel in
 * silberloeffel-catering's OFFICE_PANEL_STYLE). Values are supplied by the
 * caller from the existing Inquiry handoff state only — this component
 * renders, it doesn't derive or persist anything.
 */
export function InquiryHeroCard({
  eyebrow,
  title,
  facts,
  stateTitle,
  stateDescription,
}: InquiryHeroCardProps) {
  const visibleFacts = facts.filter((f) => f.trim().length > 0);

  return (
    <section
      className="rounded-[24px] p-6 text-white shadow-[0_18px_45px_rgba(41,54,47,0.13)] sm:p-[42px]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 85% 10%, rgba(255,255,255,.12), transparent 34%), linear-gradient(135deg, #4a5b50, #5c6f63)",
      }}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(250px,.42fr)] lg:items-center lg:gap-7">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.11em] text-white/90">
            {eyebrow}
          </p>
          <h1 className="text-[27px] font-extrabold leading-[1.1] tracking-[-.035em] sm:text-[36px] lg:text-[42px]">
            {title}
          </h1>
          {visibleFacts.length > 0 ? (
            <div className="mt-[18px] flex flex-wrap items-center gap-x-[9px] gap-y-[9px] text-xs text-white/86">
              {visibleFacts.map((fact, i) => (
                <span key={i} className="flex items-center gap-[9px]">
                  {i > 0 ? <span aria-hidden="true">·</span> : null}
                  {fact}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-[15px] border border-white/[.18] bg-white/10 p-5 backdrop-blur-sm">
          <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.08em] text-white/72">
            Aktueller Stand
          </span>
          <strong className="block text-[17px] leading-[1.25]">{stateTitle}</strong>
          {stateDescription ? (
            <p className="mt-2 text-xs text-white/79">{stateDescription}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
