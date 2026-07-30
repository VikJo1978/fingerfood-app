interface HeaderBarProps {
  title: string;
  subtitle: string;
}

export function HeaderBar({ title, subtitle }: HeaderBarProps) {
  return (
    <header className="space-y-2">
      <h1 className="text-[29px] font-extrabold leading-[1.15] tracking-[-.025em] text-ink sm:text-[38px]">
        {title}
      </h1>
      <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{subtitle}</p>
    </header>
  );
}
