import { useState } from 'react';

export function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-x-darker px-4 py-3">
      <p className="text-[13px] text-x-gray">{label}</p>
      <p className="mt-1 text-[24px] font-semibold leading-tight tabular-nums">{value}</p>
      {note && <p className="mt-0.5 truncate text-[12px] text-x-gray">{note}</p>}
    </div>
  );
}

export function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-6">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-[17px] font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export interface Bar {
  key: string;
  label: string;
  /** null: nothing known for this bar. */
  count: number | null;
}

/**
 * One series; tap (or hover) a bar to read it, the latest is shown by default.
 * `signed` series draw losses in red and name every change with its sign.
 */
export function Bars({ bars, label, unit = '条', signed = false }: { bars: Bar[]; label: string; unit?: string; signed?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((bar) => Math.abs(bar.count ?? 0)));
  const shown = bars.find((bar) => bar.key === picked) ?? bars[bars.length - 1];
  const say = (count: number | null) => (count === null ? '—' : signed && count > 0 ? `+${count}` : String(count));
  return (
    <div>
      <p className="h-5 text-[13px] text-x-gray">
        {shown.label} · <span className="font-semibold text-x-fg">{say(shown.count)}</span>{shown.count !== null && ` ${unit}`}
      </p>
      <div className="mt-2 flex h-28 items-end gap-[2px] border-b border-x-border" role="img" aria-label={label}>
        {bars.map((bar) => {
          const count = bar.count ?? 0;
          return (
            <button
              key={bar.key}
              type="button"
              onPointerEnter={() => setPicked(bar.key)}
              onClick={() => setPicked(bar.key)}
              className="flex h-full min-w-0 flex-1 items-end justify-center"
              aria-label={`${bar.label} ${say(bar.count)}${bar.count === null ? '' : ` ${unit}`}`}
            >
              <span
                className="block w-full max-w-[28px] rounded-t-[4px] transition-opacity"
                style={{
                  height: count === 0 ? 2 : `${Math.max(6, (Math.abs(count) / max) * 100)}%`,
                  background: count === 0 ? 'var(--color-x-border)' : count < 0 ? '#f4212e' : 'var(--chart-bar)',
                  opacity: picked === null || bar.key === shown.key ? 1 : 0.5,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-x-gray">
        <span>{bars[0].label}</span>
        <span>{bars[bars.length - 1].label}</span>
      </div>
    </div>
  );
}
