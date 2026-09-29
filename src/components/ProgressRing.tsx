import { cn } from '@/lib/utils';

/** A thin ring filled to done/total in the accent colour. Nothing when there is nothing to count. */
export default function ProgressRing({ total, done, size, stroke = 3, className }: {
  total: number;
  done: number;
  size: number;
  stroke?: number;
  className?: string;
}) {
  if (total <= 0) return null;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, done / total));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('-rotate-90', className)} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-x-border)" strokeWidth={stroke} />
      {ratio > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--color-x-blue))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 0.35s ease' }}
        />
      )}
    </svg>
  );
}
