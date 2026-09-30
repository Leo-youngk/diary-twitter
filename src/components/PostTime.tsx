import { useMinute } from '@/data/hooks';
import { formatCompactTime } from '@/lib/utils';

/** Minute ticks update the label without re-rendering the entire post card. */
export default function PostTime({ date }: { date: string }) {
  const minute = useMinute();
  return <>{formatCompactTime(date, new Date(minute * 60_000))}</>;
}
