interface HeaderBarProps {
  title: string;
  subtitle: string;
}

export function HeaderBar({ title, subtitle }: HeaderBarProps) {
  return (
    <header className="space-y-2">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h1>
      <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">{subtitle}</p>
    </header>
  );
}
