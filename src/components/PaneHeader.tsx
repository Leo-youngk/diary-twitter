import type { Ref } from 'react';

/**
 * The sticky header of a main tab: a centred title with optional controls on
 * either side, and optional rows (tabs, filters) underneath. Pass `ref` to
 * let it slide away while reading (see useScrollChrome).
 */
export default function PaneHeader({ title, left, right, children, ref }: {
  title: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <header ref={ref} className="frosted sticky top-0 z-20 will-change-transform">
      <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center px-4">
        <div className="flex min-w-0 items-center justify-start">{left}</div>
        <h1 className="flex items-center text-[17px] font-semibold">{title}</h1>
        <div className="flex min-w-0 items-center justify-end">{right}</div>
      </div>
      {children}
    </header>
  );
}
