import logo from "../../assets/silberloeffel-logo.jpg";

interface HeaderBarProps {
  title: string;
  subtitle: string;
}

export function HeaderBar({ title, subtitle }: HeaderBarProps) {
  return (
    <header className="space-y-3">
      <img src={logo} alt="Silberlöffel Event Catering Service" className="h-16 w-auto sm:h-20" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">{subtitle}</p>
      </div>
    </header>
  );
}
