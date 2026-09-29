/**
 * The sticky header of a main tab: a centred title with optional controls on
 * either side, and optional rows (tabs, a week strip) underneath.
 */
export default function PaneHeader({ title, left, right, children }: {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="frosted sticky top-0 z-20 border-b border-x-border">
      <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center px-4">
        <div className="flex min-w-0 items-center justify-start">{left}</div>
        <h1 className="text-[17px] font-semibold">{title}</h1>
        <div className="flex min-w-0 items-center justify-end">{right}</div>
      </div>
      {children}
    </header>
  );
}
