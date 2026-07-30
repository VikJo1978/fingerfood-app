interface TagBadgeProps {
  label: string;
}

export function TagBadge({ label }: TagBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-medium text-muted">
      {label}
    </span>
  );
}
