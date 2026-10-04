import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMainTab } from '@/app/mainTab';
import { useScrollChrome } from '@/app/scrollChrome';
import { useNav } from '@/app/nav';
import { XLogo } from '@/components/Icon';
import PaneHeader from '@/components/PaneHeader';
import PaneLayout from '@/components/PaneLayout';
import { Bars, Section, Tile, type Bar } from '@/components/StatsParts';
import { AlgorithmSection, FeedSection, TodaySection } from '@/components/XGrowth';
import { checkX } from '@/data/connection';
import {
  useGoalProgress, useMinute, usePosts, useToday, useXAccount, useXFollowers, useXPosts, useXTweets,
} from '@/data/hooks';
import { store } from '@/data/store';
import { tweetIdOfLink } from '@/lib/schema';
import { goalTotals, perfectStreak } from '@/lib/goals';
import { diagnose, followerTrend, myTweets, todayPlan } from '@/lib/growth';
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

function dayLabel(key: string): string {
  const date = parseDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** What to do on X today, what was posted, how the goals went, and how the posts did on X. */
export default function StatsPane() {
  const posts = usePosts();
  const xposts = useXPosts();
  const xTweets = useXTweets();
  const account = useXAccount();
  const followerRows = useXFollowers();
  const progress = useGoalProgress();
  const today = useToday();
  const now = useMinute() * 60_000;
  const { push } = useNav();
  const [period, setPeriod] = useState<Period>(30);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const active = useMainTab() === 'stats';
  useScrollChrome(scrollRef, headerRef, active);
  useEffect(() => { if (active) checkX(); }, [active]);

  // Posting is counted from the tweets on X, wherever they were written.
  const tweetDays = useMemo(() => Object.values(xTweets)
    .filter((t) => !t.gone && t.createdAt)
    .map((t) => ({ key: toLocalDateKey(t.createdAt), reply: t.kind === 'reply' })), [xTweets]);
  const perDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const { key } of tweetDays) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, [tweetDays]);
  const firstDay = [...perDay.keys()].reduce((first, key) => (key < first ? key : first), today);
  const from = period === 0 ? firstDay : addDays(today, -(period - 1));
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
    const replyCount = tweetDays.filter(({ key, reply }) => reply && key >= from && key <= today).length;
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
  }, [perDay, tweetDays, from, today, period]);

  // Written in the diary but not on X: never synced, failed, still on its way, or deleted there.
  const local = useMemo(() => {
    let total = 0;
    let only = 0;
    for (const post of posts) {
      const key = toLocalDateKey(post.createdAt);
      if ((period !== 0 && key < from) || key > today) continue;
      total += 1;
      const row = xposts[post.id];
      const tweetId = row?.state === 'sent' ? tweetIdOfLink(row.link) : null;
      if (!tweetId || xTweets[tweetId]?.gone) only += 1;
    }
    return { total, only };
  }, [posts, xposts, xTweets, period, from, today]);

  const goals = useMemo(() => ({
    range: goalTotals(progress, period === 0 ? '' : from, today),
    today: progress.get(today),
    streak: perfectStreak(progress, today),
  }), [progress, period, from, today]);

  // Tweets sent from the app open their post here; the rest open on X.
  const appPost = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, row] of Object.entries(xposts)) {
      const tweetId = row.state === 'sent' ? tweetIdOfLink(row.link) : null;
      if (!tweetId) continue;
      map.set(tweetId, row.kind === 'reply' ? String(store.getCell('replies', id, 'postId') ?? '') : id);
    }
    return map;
  }, [xposts]);
  const openTweet = useCallback((id: string) => {
    const postId = appPost.get(id);
    if (postId) push('Post', { postId });
    else window.open(`https://x.com/i/status/${id}`, '_blank', 'noopener');
  }, [appPost, push]);

  // Measured as X's For You code ranks posts (src/lib/growth.ts).
  const mine = useMemo(() => myTweets(xTweets), [xTweets]);
  const plan = useMemo(() => todayPlan(mine, today, now), [mine, today, now]);
  const diagnosis = useMemo(() => diagnose(mine, period === 0 ? 0 : parseDateKey(from).getTime(), now), [mine, period, from, now]);
  const followers = useMemo(() => followerTrend(followerRows, today, now), [followerRows, today, now]);

  const x = useMemo(() => {
    // Replies are short and seen by few; they would drag the averages down.
    const live = Object.entries(xTweets)
      .filter(([, t]) => !t.gone && t.kind !== 'reply' && t.createdAt && (period === 0 || toLocalDateKey(t.createdAt) >= from));
    const measured = live.filter(([, t]) => t.measuredAt > 0);
    const sum = (key: 'views' | 'likes' | 'replies' | 'reposts' | 'quotes' | 'bookmarks') => measured.reduce((n, [, t]) => n + (t[key] ?? 0), 0);
    const totals = { views: sum('views'), likes: sum('likes'), replies: sum('replies'), reposts: sum('reposts'), quotes: sum('quotes'), bookmarks: sum('bookmarks') };
    const top = [...measured]
      .sort(([, a], [, b]) => (b.views - a.views) || (b.likes - a.likes))
      .slice(0, 5)
      .map(([id, t]) => ({ id, text: t.text, views: t.views, likes: t.likes }));
    return {
      count: live.length,
      fromApp: live.filter(([id]) => appPost.has(id)).length,
      measuredCount: measured.length,
      totals,
      measuredAt: Math.max(0, ...measured.map(([, t]) => t.measuredAt)),
      top,
    };
  }, [xTweets, appPost, period, from]);

  const todayCount = perDay.get(today) ?? 0;
  const yesterdayCount = perDay.get(addDays(today, -1)) ?? 0;
  const average = writing.total / spanDays;
  const engagements = x.totals.likes + x.totals.replies + x.totals.reposts + x.totals.quotes;
  const rate = x.totals.views > 0 ? `${((engagements / x.totals.views) * 100).toFixed(1)}%` : '—';
  const time = (at: number) => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const goalRate = goals.range.total > 0 ? `${Math.round((goals.range.done / goals.range.total) * 100)}%` : '—';

  return (
    <PaneLayout
      scrollRef={scrollRef}
      headerRef={headerRef}
      className="pb-28"
      header={(
          <PaneHeader title="统计" ref={headerRef}>
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
      )}
    >

      <TodaySection plan={plan} followers={account?.handle ? account.followers : null} today={today} now={now} />

      <Section title="发帖">
        <p className="mt-1 text-[13px] text-x-gray">
          {tweetDays.length > 0 ? '以 X 上的推文为准，含回复' : '还没有读到 X 上的推文'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Tile label="今天" value={`${todayCount} 条`} note={`昨天 ${yesterdayCount} 条`} />
          <Tile label="平均每天" value={average >= 10 ? average.toFixed(0) : average.toFixed(1)} note={`${writing.activeDays} 天有发帖`} />
          <Tile label={period === 0 ? '共发帖' : `${period} 天共发帖`} value={String(writing.total)} note={`其中回复 ${writing.replyCount} 条`} />
          <Tile label="连续发帖" value={`${writing.streak} 天`} note={writing.streak > 0 && todayCount === 0 ? '今天还没发' : undefined} />
          <div className="col-span-2">
            <Tile label="只在日记本" value={`${local.only} 条`} note={`没发到 X · 日记本里共写了 ${local.total} 条`} />
          </div>
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
          {account?.handle
            ? <>@{account.handle} · <span className="font-semibold text-x-fg">{account.followers}</span> 粉丝 · 关注 {account.following}</>
            : '还没有读到 X 账号的数据'}
        </p>
        {x.count > 0 && (
          <p className="text-[13px] text-x-gray">
            {x.count} 条推文（不含回复）· App 发出 {x.fromApp} 条{x.measuredAt > 0 && ` · ${time(x.measuredAt)} 更新`}
          </p>
        )}
        {account?.error && (
          <p className="mt-1 text-[13px] text-x-danger">最近一次更新失败：{account.error}{x.measuredAt > 0 && '，下面是较早的数据'}</p>
        )}

        {followers.week && (
          <div className="mt-4">
            <h3 className="text-[15px] font-semibold">粉丝变化</h3>
            <p className="mt-0.5 text-[13px] text-x-gray">
              {followers.week.since === addDays(today, -6) ? '近 7 天' : `${dayLabel(followers.week.since)}开始记录，至今`}
              {' '}<span className="font-semibold text-x-fg">{followers.week.gain > 0 ? `+${followers.week.gain}` : followers.week.gain}</span>
            </p>
            <div className="mt-2">
              <Bars
                bars={followers.days.map(({ key, gain }) => ({ key, label: dayLabel(key), count: gain }))}
                label="每天粉丝变化"
                unit="人"
                signed
              />
            </div>
          </div>
        )}

        {x.count === 0 ? (
          <p className="mt-3 text-[13px] text-x-gray">这段时间没有推文。</p>
        ) : x.measuredCount === 0 ? (
          <p className="mt-3 text-[13px] text-x-gray">正在读取这些推文的数据…</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Tile label="浏览" value={compact.format(x.totals.views)} note={`平均每条 ${compact.format(Math.round(x.totals.views / x.measuredCount))}`} />
            <Tile label="互动率" value={rate} note="互动 ÷ 浏览" />
            <Tile label="点赞" value={compact.format(x.totals.likes)} note={`收藏 ${compact.format(x.totals.bookmarks)}`} />
            <Tile label="回复" value={compact.format(x.totals.replies)} note={`转发 ${compact.format(x.totals.reposts)} · 引用 ${compact.format(x.totals.quotes)}`} />
          </div>
        )}

        {x.top.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 text-[15px] font-semibold">浏览最多</h3>
            {x.top.map(({ id, text, views, likes }) => (
              <button
                key={id}
                type="button"
                onClick={() => openTweet(id)}
                className="flex w-full items-center gap-3 border-b border-x-border py-2.5 text-left active:bg-x-hover"
              >
                <p className="min-w-0 flex-1 truncate text-[15px]">{text || '（无文字）'}</p>
                <span className="shrink-0 text-right text-[13px] tabular-nums text-x-gray">
                  {compact.format(views)} 浏览 · {compact.format(likes)} 赞
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <AlgorithmSection diagnosis={diagnosis} onOpen={openTweet} />
      <FeedSection />
    </PaneLayout>
  );
}
