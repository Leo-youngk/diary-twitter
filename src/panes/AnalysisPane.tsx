import { useEffect, useMemo, useRef } from 'react';
import { useMainTab } from '@/app/mainTab';
import { useNav } from '@/app/nav';
import { useScrollChrome } from '@/app/scrollChrome';
import PaneHeader from '@/components/PaneHeader';
import PaneLayout from '@/components/PaneLayout';
import { Bars, Tile } from '@/components/StatsParts';
import { checkX } from '@/data/connection';
import { useMinute, useToday, useXFollowers, useXMetrics, useXTweets } from '@/data/hooks';
import {
  followerDays, livePosts, MIN_BASELINE, MIN_GROUP, outliers, patterns, pointsAt, review, WINDOW_DAYS,
  type Group, type Outlier, type Week,
} from '@/lib/analysis';
import { parseDateKey } from '@/lib/utils';

const DAY = 24 * 3600_000;
const number = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const views = (value: number | null) => (value === null ? '—' : number.format(Math.round(value)));
const times = (ratio: number) => (ratio >= 10 ? String(Math.round(ratio)) : ratio.toFixed(1));
const shortDay = (at: number) => `${new Date(at).getMonth() + 1}/${new Date(at).getDate()}`;
const openOnX = (id: string) => window.open(`https://x.com/i/status/${id}`, '_blank', 'noopener');

function followers(week: Week): string {
  if (!week.followers) return '—';
  const { gain } = week.followers;
  return gain > 0 ? `+${gain}` : String(gain);
}

function feedback(week: Week): string {
  return week.known ? `${week.responded}/${week.known}` : '—';
}

function Heading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pt-7">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      {note && <span className="shrink-0 text-[12px] text-x-gray">{note}</span>}
    </div>
  );
}

function GroupTable({ label, groups }: { label: string; groups: Group[] }) {
  if (groups.length === 0) return null;
  const best = groups.reduce((a, b) => (b.medianViews > a.medianViews ? b : a));
  return (
    <table className="mt-2 w-full text-left text-[14px]">
      <thead className="text-[12px] text-x-gray">
        <tr>
          <th scope="col" className="py-1.5 font-normal">{label}</th>
          <th scope="col" className="py-1.5 text-right font-normal">24 小时浏览中位数</th>
          <th scope="col" className="py-1.5 text-right font-normal">收到互动</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <tr key={group.key} className="border-t border-x-border">
            <th scope="row" className="py-2.5 font-normal">
              {group.key}<span className="ml-1.5 text-[12px] text-x-gray">{group.posts} 条</span>
            </th>
            <td className={`py-2.5 text-right tabular-nums ${group === best ? 'font-semibold' : ''}`}>{views(group.medianViews)}</td>
            <td className="py-2.5 text-right tabular-nums text-x-gray">{group.known ? `${group.responded}/${group.known}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function expandPrompt(post: Outlier): string {
  const text = post.text.trim();
  return `参考你之前的原创：\n${text.slice(0, 140)}${text.length > 140 ? '…' : ''}\n\n它发布 24 小时的浏览是平常的 ${times(post.ratio)} 倍，说明这个题目有人看。接着写：补一个新的例子、做法、结果或反例。`;
}

/** 分析: how posts did at the same age, against the account's own earlier posts. */
export default function AnalysisPane() {
  const tweets = useXTweets();
  const metrics = useXMetrics();
  const followerRows = useXFollowers();
  const today = useToday();
  const now = useMinute() * 60_000;
  const { push } = useNav();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const active = useMainTab() === 'analysis';
  useScrollChrome(scrollRef, headerRef, active);
  useEffect(() => { if (active) checkX(); }, [active]);

  const data = useMemo(() => {
    const points24 = pointsAt(tweets, metrics, 'h24', now);
    const from = now - WINDOW_DAYS * DAY;
    return {
      week: review(tweets, metrics, followerRows, now),
      live: livePosts(tweets, metrics, now),
      standouts: outliers(points24, from),
      found: patterns(points24, from),
      days: followerDays(followerRows, today, now),
    };
  }, [tweets, metrics, followerRows, today, now]);
  const { week, live, standouts, found, days } = data;
  const { thisWeek, lastWeek } = week;

  const pending = [
    standouts.length === 0 && `超出平常要先有 ${MIN_BASELINE} 条带 24 小时记录的原创`,
    found.formats.length + found.hours.length === 0 && `形式和时段每组要 ${MIN_GROUP} 条`,
    found.targets.length + found.delays.length === 0 && '回复对象从这次更新后开始记录',
  ].filter(Boolean);
  const dayLabel = (key: string) => `${parseDateKey(key).getMonth() + 1}月${parseDateKey(key).getDate()}日`;

  return (
    <PaneLayout
      scrollRef={scrollRef}
      headerRef={headerRef}
      className="pb-28"
      header={<PaneHeader title="分析" ref={headerRef} right={<button type="button" onClick={() => checkX()} className="py-2 text-[13px] text-x-blue">更新</button>} />}
    >
      <div className="px-4 pt-3">
        <p className="text-[13px] leading-relaxed text-x-gray">只比发布后同一时点的记录，而且只和你自己之前的帖子比。</p>

        <Heading title="这周" note="近 7 天 · 括号里是前 7 天" />
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Tile label="原创 / 回复" value={`${thisWeek.originals} / ${thisWeek.replies}`} note={`（${lastWeek.originals} / ${lastWeek.replies}）`} />
          <Tile
            label="关注者"
            value={followers(thisWeek)}
            note={thisWeek.followers?.since ? `自 ${shortDay(thisWeek.followers.since)} 有记录` : `（${followers(lastWeek)}）`}
          />
          <Tile label="原创 24 小时浏览中位数" value={views(thisWeek.medianViews)} note={`（${views(lastWeek.medianViews)}）`} />
          <Tile label="收到他人互动" value={feedback(thisWeek)} note={`（${feedback(lastWeek)}）· 按 24 小时记录`} />
        </div>
        {week.actions.length > 0 && (
          <ol className="mt-3 space-y-2 text-[14px] leading-relaxed">
            {week.actions.map((action, i) => (
              <li key={action} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-x-gray">{i + 1}.</span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        )}

        {live.length > 0 && (
          <>
            <Heading title="刚发的" note="近 48 小时的原创" />
            {live.map((post) => (
              <button key={post.id} type="button" onClick={() => openOnX(post.id)} className="block w-full border-b border-x-border py-2.5 text-left active:bg-x-hover">
                <p className="truncate text-[15px]">{post.text || '（无文字）'}</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-x-gray">
                  {post.stage} · {views(post.views)} 浏览
                  {post.usual !== null && ` · 平常 ${views(post.usual)} · 最近 ${post.of} 条中第 ${post.rank}`}
                </p>
              </button>
            ))}
          </>
        )}

        {standouts.length > 0 && (
          <>
            <Heading title="超出平常" note={`近 ${WINDOW_DAYS} 天`} />
            {standouts.map((post) => (
              <div key={post.id} className="flex items-center gap-3 border-b border-x-border py-2.5">
                <button type="button" onClick={() => openOnX(post.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[15px]">{post.text || '（无文字）'}</p>
                  <p className="mt-0.5 text-[12px] tabular-nums text-x-gray">24 小时 {views(post.views)} 浏览 · 平常的 {times(post.ratio)} 倍</p>
                </button>
                <button type="button" onClick={() => push('Compose', { writingPrompt: expandPrompt(post) })} className="shrink-0 py-1 text-[13px] text-x-blue">接着写</button>
              </div>
            ))}
          </>
        )}

        {found.formats.length + found.hours.length > 0 && (
          <>
            <Heading title="什么形式、什么时候发" note={`近 ${WINDOW_DAYS} 天的原创`} />
            <GroupTable label="形式" groups={found.formats} />
            <GroupTable label="发帖时段" groups={found.hours} />
          </>
        )}

        {found.targets.length + found.delays.length > 0 && (
          <>
            <Heading title="回复谁、什么时候回" note={`近 ${WINDOW_DAYS} 天的对外回复`} />
            <GroupTable label="对方粉丝数" groups={found.targets} />
            <GroupTable label="对方发帖后多久" groups={found.delays} />
          </>
        )}

        {days.some((day) => day.gain !== null) && (
          <>
            <Heading title="关注者" note="近 14 天每天的净变化" />
            <div className="mt-2">
              <Bars bars={days.map(({ key, gain }) => ({ key, label: dayLabel(key), count: gain }))} label="每天关注者净变化" unit="人" signed />
            </div>
          </>
        )}

        {pending.length > 0 && <p className="mt-6 text-[12px] leading-relaxed text-x-gray">还在积累：{pending.join('；')}。</p>}

        <details className="mt-5 text-[12px] leading-relaxed text-x-gray">
          <summary className="cursor-pointer py-1">怎么算的</summary>
          <p className="mt-2">每条帖子在发布后 30 分钟、2 小时、24 小时、48 小时各记一次，比较只用同一时点的记录。「平常」是它之前最多 10 条原创在同一时点的浏览中位数，至少要有 {MIN_BASELINE} 条才比；形式、时段、回复对象每组至少 {MIN_GROUP} 条，并且至少有两组才比。</p>
          <p className="mt-2">「收到他人互动」指赞、他人回复、转发、引用、收藏中至少一项，已扣除自己的补充；没报全的记录不计入分母。浏览不是独立读者，也不是推荐分。关注者只看净变化，不归到某一条帖子。</p>
          <p className="mt-2">这些是你自己账号里的规律，样本小，只说明值得多试，不证明因果。</p>
          <a href="https://github.com/Leo-youngk/diary-twitter/blob/master/docs/2026-10-05-creator-data-practices.md" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-x-blue">别人怎么用数据养号 ↗</a>
        </details>
      </div>
    </PaneLayout>
  );
}
