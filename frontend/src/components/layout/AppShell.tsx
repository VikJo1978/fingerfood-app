import type { ReactNode } from "react";
import logo from "../../assets/silberloeffel-logo.jpg";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#f6f7f6]">
      {/* White brand band: the logo is an opaque JPEG, so it must sit on a
          white surface — never directly on the tinted page background. */}
      <div className="border-b border-slate-200/70 bg-white">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3 sm:px-6 lg:px-8">
          <img
            src={logo}
            alt="Silberlöffel Event Catering Service"
            className="h-14 w-auto sm:h-16"
          />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</div>
    </div>
  );
}
