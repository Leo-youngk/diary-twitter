import { useEffect, useMemo, useRef, useState } from 'react';
import { useMainTab } from '@/app/mainTab';
import { useNav } from '@/app/nav';
import { useScrollChrome } from '@/app/scrollChrome';
import PaneHeader from '@/components/PaneHeader';
import PaneLayout from '@/components/PaneLayout';
import { DataDetails, GrowthDashboard, MethodSources } from '@/components/XGrowth';
import { checkX } from '@/data/connection';
import { useMinute, useXAccount, useXFollowers, useXMetrics, useXTweets } from '@/data/hooks';
import { cn } from '@/lib/utils';
import { followerChange, xInsights } from '@/lib/xInsights';

export default function StatsPane() {
  const tweets = useXTweets();
  const metrics = useXMetrics();
  const account = useXAccount();
  const followerRows = useXFollowers();
  const now = useMinute() * 60_000;
  const { push } = useNav();
  const [days, setDays] = useState(7);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const active = useMainTab() === 'stats';
  useScrollChrome(scrollRef, headerRef, active);
  useEffect(() => { if (active) checkX(); }, [active]);
  const insights = useMemo(() => xInsights(tweets, metrics, days, now), [tweets, metrics, days, now]);
  const change = useMemo(() => followerChange(followerRows, days, now), [followerRows, days, now]);
  const time = (at: number) => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const onWrite = (writingPrompt: string) => push('Compose', { writingPrompt });

  return <PaneLayout scrollRef={scrollRef} headerRef={headerRef} className="pb-28" header={
    <PaneHeader title="统计" ref={headerRef} right={<button type="button" onClick={() => checkX()} className="py-2 text-[13px] text-x-blue">更新</button>}>
      <div className="flex gap-2 px-4 pb-2.5">{[7, 30].map((period) => <button key={period} type="button" onClick={() => setDays(period)} aria-pressed={days === period}
        className={cn('pressable rounded-full px-3.5 py-1 text-[14px]', days === period ? 'bg-x-fg font-semibold text-x-dark' : 'bg-x-darker text-x-gray')}>近 {period} 天</button>)}</div>
    </PaneHeader>
  }>
    <div className="px-4 py-4">
      {account?.handle ? <>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><a href={`https://x.com/${account.handle}`} target="_blank" rel="noopener noreferrer" className="text-[13px] text-x-gray">@{account.handle}</a>
          <p className="text-[15px]"><strong className="text-[22px] font-semibold tabular-nums">{account.measuredAt > 0 ? account.followers : '—'}</strong> 关注者{change && <span className="ml-2 text-[13px] text-x-gray">{change.gain > 0 ? '+' : ''}{change.gain} · 自 {time(change.from)}</span>}</p></div>
        <p className="mt-1 text-[12px] text-x-gray">{insights.originalCount} 条原创 · {insights.replyCount} 条对外回复{account.measuredAt > 0 && ` · 更新于 ${time(account.measuredAt)}`}</p>
      </> : <div className="flex items-center justify-between gap-3"><p className="text-[14px] text-x-gray">连接 X 后，用自己的反馈挑选下一条内容。</p><button type="button" onClick={() => push('Settings', {})} className="shrink-0 py-2 text-[14px] text-x-blue">连接 X</button></div>}
      {account?.error && <p role="status" className="mt-2 text-[13px] text-x-danger">更新失败，下面保留上次数据：{account.error}</p>}
    </div>
    <GrowthDashboard insights={insights} handle={account?.handle ?? ''} onWrite={onWrite} />
    <DataDetails posts={insights.posts} now={now} />
    <MethodSources noFeedback={insights.noFeedback} />
  </PaneLayout>;
}
