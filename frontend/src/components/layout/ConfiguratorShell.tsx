import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface ConfiguratorShellProps {
  onBack?: () => void;
  crumb: string;
  activeLabel?: string;
  footerTitle?: string;
  footerText?: string;
  children: ReactNode;
}

/**
 * Office-Panel application shell for the Configurator route only (the
 * Inquiry-intake landing page keeps the plain AppShell — it has no active
 * Inquiry/section context to anchor a sidebar to). Mirrors .office-app /
 * .office-sidebar / .office-topbar / .office-content from
 * silberloeffel-catering's OFFICE_PANEL_STYLE: 248px sidebar, sticky top
 * bar, 1440px content max-width.
 */
export function ConfiguratorShell({
  onBack,
  crumb,
  activeLabel = crumb,
  footerTitle,
  footerText,
  children,
}: ConfiguratorShellProps) {
  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar
        onBack={onBack}
        activeLabel={activeLabel}
        footerTitle={footerTitle}
        footerText={footerText}
      />
      <div className="flex min-w-0 flex-col">
        <TopBar crumb={crumb} />
        <div className="mx-auto w-full max-w-content px-4 pb-16 pt-6 lg:px-[54px] lg:pt-[34px]">
          {children}
        </div>
      </div>
    </div>
  );
}
