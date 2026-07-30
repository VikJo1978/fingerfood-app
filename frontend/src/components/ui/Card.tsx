import type { ReactNode } from "react";

interface CardProps {
  /** Small uppercase caption above the title, matching the Office Panel's
   * eyebrow/section-label convention (e.g. "Basisdaten"). */
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** Optional element rendered on the same row as the title (e.g. a status
   * pill or a secondary action). */
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Shared card chrome matching the Office Panel's `.inquiry-card` /
 * `.dashboard-card` pattern: line border, card radius, soft shadow, white
 * surface. Used across the Configurator so it reads as the same product as
 * the Office Panel instead of a separate one. */
export function Card({ eyebrow, title, subtitle, headerAction, children, className }: CardProps) {
  const hasHeader = eyebrow || title || subtitle;
  return (
    <section
      className={`rounded-card border border-line bg-white shadow-card ${className ?? ""}`}
    >
      {hasHeader ? (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="mt-0.5 text-[17px] font-bold leading-tight text-ink">{title}</h2>
            ) : null}
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}
