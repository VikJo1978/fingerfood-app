export type WarningBannerTone = "warning" | "danger";

interface WarningBannerProps {
  message: string;
  /** "warning" (default) matches the Office Panel's quiet amber notice
   * (`.inquiry-notice`); "danger" matches its blocked/error variant
   * (`.inquiry-notice.blocked`). */
  tone?: WarningBannerTone;
}

const TONE_CLASSES: Record<WarningBannerTone, string> = {
  warning: "border-warning-border bg-warning-soft text-warning",
  danger: "border-danger-border bg-danger-soft text-danger",
};

export function WarningBanner({ message, tone = "warning" }: WarningBannerProps) {
  return (
    <div className={`rounded-control border px-4 py-3 text-sm ${TONE_CLASSES[tone]}`} role="status">
      {message}
    </div>
  );
}
