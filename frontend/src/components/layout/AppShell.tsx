import type { ReactNode } from "react";
import logo from "../../assets/silberloeffel-logo.jpg";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-canvas">
      {/* White brand band: the logo is an opaque JPEG, so it must sit on a
          white surface — never directly on the tinted page background. */}
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-content items-center px-4 py-4 sm:px-6 lg:px-8">
          <img
            src={logo}
            alt="Silberlöffel Event Catering Service"
            className="h-16 w-auto sm:h-20"
          />
        </div>
      </div>
      <div className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</div>
    </div>
  );
}
