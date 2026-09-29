import { useMemo, useState } from 'react';
import { useFlow } from '@stackflow/react';
import { XLogo } from '@/components/Icon';
import PaneHeader from '@/components/PaneHeader';
import { useGoalProgress, usePosts, useToday, useXPosts } from '@/data/hooks';
import { store, ui } from '@/data/store';
import { goalTotals, perfectStreak } from '@/lib/goals';
import { addDays, cn, daysBetween, parseDateKey, toLocalDateKey } from '@/lib/utils';

type Period = 7 | 30 | 0;
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 0, label: '全部' },
];
const MIN_MONTHS = 12;
const MAX_MONTHS = 24;
const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-x-darker px-4 py-3">
      <p className="text-[13px] text-x-gray">{label}</p>
      <p className="mt-1 text-[24px] font-semibold leading-tight tabular-nums">{value}</p>
      {note && <p className="mt-0.5 truncate text-[12px] text-x-gray">{note}</p>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
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

interface Bar {
  key: string;
  label: string;
  count: number;
}

/** One series of counts; tap (or hover) a bar to read it, the latest is shown by default. */
function Bars({ bars, label }: { bars: Bar[]; label: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  const shown = bars.find((bar) => bar.key === picked) ?? bars[bars.length - 1];
  return (
    <div>
      <p className="h-5 text-[13px] text-x-gray">
        {shown.label} · <span className="font-semibold text-x-fg">{shown.count}</span> 条
      </p>
      <div className="mt-2 flex h-28 items-end gap-[2px] border-b border-x-border" role="img" aria-label={label}>
        {bars.map((bar) => (
          <button
            key={bar.key}
            type="button"
            onPointerEnter={() => setPicked(bar.key)}
            onClick={() => setPicked(bar.key)}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
            aria-label={`${bar.label} ${bar.count} 条`}
          >
            <span
              className="block w-full max-w-[28px] rounded-t-[4px] transition-opacity"
              style={{
                height: bar.count === 0 ? 2 : `${Math.max(6, (bar.count / max) * 100)}%`,
                background: bar.count === 0 ? 'var(--color-x-border)' : 'var(--chart-bar)',
                opacity: picked === null || bar.key === shown.key ? 1 : 0.5,
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-x-gray">
        <span>{bars[0].label}</span>
        <span>{bars[bars.length - 1].label}</span>
      </div>
    </div>
  );
}

function dayLabel(key: string): string {
  const date = parseDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** What was written, how the goals went, and how the posts did on X. */
export default function StatsPane() {
  const posts = usePosts();
  const replies = ui.useTable('replies', store);
  const xposts = useXPosts();
  const progress = useGoalProgress();
  const today = useToday();
  const { push } = useFlow();
  const [period, setPeriod] = useState<Period>(30);

  const perDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const post of posts) {
      const key = toLocalDateKey(post.createdAt);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [posts]);
  const firstDay = posts.length > 0 ? toLocalDateKey(posts[posts.length - 1].createdAt) : today;
  const from = period === 0 ? (firstDay < today ? firstDay : today) : addDays(today, -(period - 1));
  const spanDays = daysBetween(from, today) + 1;

  const writing = useMemo(() => {
    let total = 0;
    let activeDays = 0;
    let busiest: { key: string; count: number } | null = null;
    for (const [key, count] of perDay) {
      if (key < from || key > today) continue;
      total += count;
      activeDays += 1;
      if (!busiest || count > busiest.count) busiest = { key, count };
    }
    const replyCount = Object.values(replies).filter((reply) => {
      const key = reply.createdAt ? toLocalDateKey(String(reply.createdAt)) : '';
      return key >= from && key <= today;
    }).length;
    let streak = 0;
    for (let key = perDay.has(today) ? today : addDays(today, -1); perDay.has(key); key = addDays(key, -1)) streak += 1;

    let bars: Bar[];
    if (period === 0) {
      const months = new Map<string, number>();
      for (const [key, count] of perDay) months.set(key.slice(0, 7), (months.get(key.slice(0, 7)) ?? 0) + count);
      const start = parseDateKey(from);
      const end = parseDateKey(today);
      const spanMonths = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
      // At least a year, so a young diary still reads as a timeline rather than one slab.
      const count = Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, spanMonths));
      bars = Array.from({ length: count }, (_, i) => {
        const date = new Date(end.getFullYear(), end.getMonth() - (count - 1 - i), 1);
        const key = toLocalDateKey(date).slice(0, 7);
        return { key, label: `${date.getFullYear()}年${date.getMonth() + 1}月`, count: months.get(key) ?? 0 };
      });
    } else {
      bars = Array.from({ length: period }, (_, i) => {
        const key = addDays(from, i);
        return { key, label: dayLabel(key), count: perDay.get(key) ?? 0 };
      });
    }
    return { total, activeDays, busiest, replyCount, streak, bars };
  }, [perDay, replies, from, today, period]);

  const goals = useMemo(() => ({
    range: goalTotals(progress, period === 0 ? '' : from, today),
    today: progress.get(today),
    streak: perfectStreak(progress, today),
  }), [progress, period, from, today]);

  const x = useMemo(() => {
    const sent = Object.entries(xposts).filter(([, row]) => row.state === 'sent' && (period === 0 || toLocalDateKey(row.at) >= from));
    const sum = (key: 'impressions' | 'likes' | 'replies' | 'reposts') => sent.reduce((n, [, row]) => n + (row[key] ?? 0), 0);
    const totals = { impressions: sum('impressions'), likes: sum('likes'), replies: sum('replies'), reposts: sum('reposts') };
    const measuredAt = Math.max(0, ...sent.map(([, row]) => row.metricsAt ?? 0));
    const textOf = (id: string, kind: string) => String(
      kind === 'reply' ? store.getCell('replies', id, 'content') ?? '' : store.getCell('posts', id, 'content') ?? '',
    );
    const top = [...sent]
      .sort(([, a], [, b]) => (b.impressions - a.impressions) || (b.likes - a.likes))
      .slice(0, 5)
      .map(([id, row]) => ({
        id,
        postId: row.kind === 'reply' ? String(store.getCell('replies', id, 'postId') ?? '') : id,
        text: textOf(id, row.kind),
        row,
      }));
    return { count: sent.length, totals, measuredAt, top };
  }, [xposts, period, from]);

  const todayCount = perDay.get(today) ?? 0;
  const yesterdayCount = perDay.get(addDays(today, -1)) ?? 0;
  const average = writing.total / spanDays;
  const rate = x.totals.impressions > 0
    ? `${(((x.totals.likes + x.totals.replies + x.totals.reposts) / x.totals.impressions) * 100).toFixed(1)}%`
    : '—';
  const goalRate = goals.range.total > 0 ? `${Math.round((goals.range.done / goals.range.total) * 100)}%` : '—';

  return (
    <div data-scroll-root className="relative h-full overflow-y-auto pb-28">
      <PaneHeader title="统计">
        <div className="flex gap-2 px-4 pb-2.5">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={cn('pressable rounded-full px-3.5 py-1 text-[14px]', period === value ? 'bg-x-fg font-semibold text-x-dark' : 'bg-x-darker text-x-gray')}
            >
              {label}
            </button>
          ))}
        </div>
      </PaneHeader>

      <Section title="发帖">
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Tile label="今天" value={`${todayCount} 条`} note={`昨天 ${yesterdayCount} 条`} />
          <Tile label="平均每天" value={average >= 10 ? average.toFixed(0) : average.toFixed(1)} note={`${writing.activeDays} 天有发帖`} />
          <Tile label={period === 0 ? '共发帖' : `${period} 天共发帖`} value={String(writing.total)} note={`另有 ${writing.replyCount} 条追加`} />
          <Tile label="连续发帖" value={`${writing.streak} 天`} note={writing.streak > 0 && todayCount === 0 ? '今天还没发' : undefined} />
        </div>
        <div className="mt-5">
          <h3 className="text-[15px] font-semibold">{period === 0 ? '每月发帖' : '每天发帖'}</h3>
          <div className="mt-2">
            <Bars key={period} bars={writing.bars} label={period === 0 ? '每月发帖条数' : '每天发帖条数'} />
          </div>
          {writing.busiest && (
            <p className="mt-2 text-[13px] text-x-gray">
              最多的一天：{dayLabel(writing.busiest.key)} · <span className="font-semibold text-x-fg">{writing.busiest.count}</span> 条
            </p>
          )}
        </div>
      </Section>

      <Section title="目标">
        {progress.size === 0 ? (
          <p className="mt-1 text-[13px] text-x-gray">还没有写过目标。</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Tile label="今天" value={goals.today ? `${goals.today.done}/${goals.today.total}` : '—'} note={goals.today ? undefined : '今天还没写目标'} />
            <Tile label="完成率" value={goalRate} note={`${goals.range.done}/${goals.range.total} 个`} />
            <Tile label="全部完成的天数" value={`${goals.range.perfectDays} 天`} note={`${goals.range.days} 天写了目标`} />
            <Tile label="连续全部完成" value={`${goals.streak} 天`} />
          </div>
        )}
      </Section>

      <Section title="X 上的表现" icon={<XLogo size={16} />}>
        <p className="mt-1 text-[13px] text-x-gray">
          {x.count === 0
            ? '这段时间没有发到 X 的内容。'
            : x.measuredAt > 0
              ? `${x.count} 条 · 数据由 Buffer 提供，更新于 ${new Date(x.measuredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : `${x.count} 条 · Buffer 还没有返回数据`}
        </p>
        {x.count > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Tile label="曝光" value={compact.format(x.totals.impressions)} />
            <Tile label="互动率" value={rate} note="点赞、回复、转发 ÷ 曝光" />
            <Tile label="点赞" value={compact.format(x.totals.likes)} />
            <Tile label="回复" value={compact.format(x.totals.replies)} note={`转发 ${compact.format(x.totals.reposts)}`} />
          </div>
        )}

        {x.top.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 text-[15px] font-semibold">曝光最多</h3>
            {x.top.map(({ id, postId, text, row }) => (
              <button
                key={id}
                type="button"
                onClick={() => postId && push('Post', { postId })}
                className="flex w-full items-center gap-3 border-b border-x-border py-2.5 text-left active:bg-x-hover"
              >
                <p className="min-w-0 flex-1 truncate text-[15px]">{text || '（已删除）'}</p>
                <span className="shrink-0 text-right text-[13px] tabular-nums text-x-gray">
                  {compact.format(row.impressions)} 曝光 · {compact.format(row.likes)} 赞
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
