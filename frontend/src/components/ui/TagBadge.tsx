interface TagBadgeProps {
  label: string;
}

export function TagBadge({ label }: TagBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600">
      {label}
    </span>
  );
}
