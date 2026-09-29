import { cn } from '@/lib/utils';

/**
 * The sticky header of a main tab: a centred title with optional controls on
 * either side, and optional rows (tabs, filters) underneath. `hidden` slides
 * it away while reading (see useHideOnScroll).
 */
export default function PaneHeader({ title, left, right, hidden = false, children }: {
  title: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  hidden?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header
      className={cn('frosted sticky top-0 z-20 transition-transform duration-300 ease-out', hidden && '-translate-y-full')}
    >
      <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center px-4">
        <div className="flex min-w-0 items-center justify-start">{left}</div>
        <h1 className="flex items-center text-[17px] font-semibold">{title}</h1>
        <div className="flex min-w-0 items-center justify-end">{right}</div>
      </div>
      {children}
    </header>
  );
}
