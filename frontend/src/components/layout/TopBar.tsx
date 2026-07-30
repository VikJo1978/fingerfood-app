interface TopBarProps {
  crumb: string;
}

/** Compact Office-Panel-style top bar: a single muted breadcrumb label, no page title here. */
export function TopBar({ crumb }: TopBarProps) {
  return (
    <div className="sticky top-0 z-20 flex min-h-[58px] items-center border-b border-line bg-canvas/95 px-4 backdrop-blur-sm lg:min-h-[76px] lg:px-[54px]">
      <span className="text-[13px] text-muted">{crumb}</span>
    </div>
  );
}
