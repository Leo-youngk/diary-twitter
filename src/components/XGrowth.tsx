import { useMemo, useState } from 'react';
import { toast } from '@/app/toast';
import { Section } from '@/components/StatsParts';
import { addGoals, endXExperiment, labelXTweet, reviewXReplies, startXExperiment } from '@/data/actions';
import { useGoalIds, useXExperiments, useXLabels, useXMetrics } from '@/data/hooks';
import { store } from '@/data/store';
import {
  cohortPosts, experimentResult, FORMATS, groupCohorts, HOURS, MIN_COHORT, replyQueue, suggestTopic, TOPICS,
  type CohortGroup, type Dimension, type MyTweet,
} from '@/lib/growth';
import { hasMetric, HOUR_MS, STAGES, type Stage } from '@/lib/xMetrics';
import { cn } from '@/lib/utils';

const number = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const oneDecimal = (value: number | null) => value === null ? '—' : value.toFixed(1);
const openOnX = (id: string) => window.open(`https://x.com/i/status/${id}`, '_blank', 'noopener');
const field = 'min-w-0 rounded-lg border border-x-border bg-x-dark px-2 py-1.5 text-[13px] text-x-fg';
const button = 'pressable rounded-full border border-x-border px-3 py-1.5 text-[13px] font-semibold';
const DIMENSIONS: Array<[Dimension, string]> = [['topic', '内容'], ['format', '形式'], ['hour', '时段']];
const options = (dimension: Dimension) => dimension === 'topic' ? [...TOPICS] : dimension === 'format' ? [...FORMATS] : HOURS;

function ComparisonRow({ group }: { group: CohortGroup }) {
  return (
    <div className="border-b border-x-border py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="min-w-0 truncate font-semibold">{group.key}</span>
        <span className="shrink-0 tabular-nums">{group.posts ? number.format(group.medianViews) : '—'} 浏览</span>
      </div>
      <p className="mt-0.5 text-[12px] tabular-nums text-x-gray">
        {group.posts} 条 / {group.days} 天 · 每千次浏览：收藏 {oneDecimal(group.bookmarksPerThousand)} · 转发 {oneDecimal(group.repostsPerThousand)} · 回复 {oneDecimal(group.repliesPerThousand)}
      </p>
    </div>
  );
}

/** Turn observed outcomes into a small next action; source code supplies hypotheses, never scores. */
export function GrowthDashboard({ tweets, from, now }: { tweets: MyTweet[]; from: number; now: number }) {
  const metrics = useXMetrics();
  const labels = useXLabels();
  const experiments = useXExperiments();
  const [stage, setStage] = useState<Stage>('h24');
  const [dimension, setDimension] = useState<Dimension>('topic');
  const [newDimension, setNewDimension] = useState<Dimension>('topic');
  const [a, setA] = useState<string>(TOPICS[0]);
  const [b, setB] = useState<string>(TOPICS[1]);
  const [showMore, setShowMore] = useState(false);
  const cohorts = useMemo(() => cohortPosts(tweets, metrics, labels, stage, from, now), [tweets, metrics, labels, stage, from, now]);
  // Today's suggestions use the selected period but always a 24-hour comparison.
  const at24 = useMemo(() => cohortPosts(tweets, metrics, labels, 'h24', from, now), [tweets, metrics, labels, from, now]);
  const groups = useMemo(() => groupCohorts(cohorts, dimension), [cohorts, dimension]);
  const topicGroups = useMemo(() => groupCohorts(at24, 'topic').filter((g) => g.key !== '未分类' && g.posts >= MIN_COHORT && g.days >= 2), [at24]);
  const originals = tweets.filter((t) => t.original && t.at <= now).reverse();
  const recent = originals.filter((t) => now - t.at < 2 * HOUR_MS).slice(0, 2);
  const pending = originals.slice(0, 12).filter((t) => !labels[t.id]?.topic);
  const replies = replyQueue(tweets, labels, now);
  const experimentEntries = Object.entries(experiments).filter(([, e]) => e.startedAt > 0).sort(([, left], [, right]) => right.startedAt - left.startedAt);
  const active = experimentEntries.find(([, e]) => !e.endedAt);
  // Experiment results ignore the view's 7/30-day filter so changing a tab never drops enrolled posts.
  const all24 = useMemo(() => cohortPosts(tweets, metrics, labels, 'h24', 0, now), [tweets, metrics, labels, now]);
  const result = active ? experimentResult(active[1], tweets, all24, labels) : null;
  const goal = pending.length > 0 ? `给最近 ${Math.min(3, pending.length)} 篇帖子补上内容分类`
    : active && result && !result.enough ? `继续「${result.postedA <= result.postedB ? active[1].a : active[1].b}」这组实验，写一篇有具体例子的原创`
    : topicGroups.length >= 2 ? `再写一篇「${topicGroups[0].key}」，验证 24 小时表现是否稳定`
    : '发一篇有一手经历或具体例子的原创，记录发布后 24 小时表现';
  const today = new Date(now);
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const goalIds = useGoalIds(day);
  const added = goalIds.some((id) => store.getCell('goals', id, 'text') === goal);
  const best = [...cohorts].sort((left, right) => right.views - left.views).slice(0, 3);

  return (
    <>
      <Section title="今天怎么做">
        <p className="mt-2 text-[15px] font-semibold leading-snug">{goal}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-x-gray">
          {pending.length > 0 ? '先分清写了什么，才知道哪种内容值得继续。下面可以逐条确认分类。'
            : active ? '每次只改变一个变量；轮换两组，其他条件尽量相同。'
            : topicGroups.length >= 2 ? `已有 ${topicGroups.map((g) => `${g.key} ${g.posts} 条`).join('、')} 的同龄记录。当前领先仍是待验证的线索。`
            : `已记录 ${at24.length} 份 24 小时观察。每组至少 ${MIN_COHORT} 条、跨 2 天后再给初步倾向。`}
        </p>
        <button type="button" disabled={added} className={`${button} mt-2 disabled:text-x-gray`} onClick={() => {
          addGoals(day, [goal]); toast('已加入今天的目标');
        }}>{added ? '已加入目标' : '加入今天的目标'}</button>

        {replies.length > 0 && <div className="mt-4">
          <p className="text-[14px] font-semibold">去 X 看看这些回复</p>
          {replies.map((post) => <div key={post.id} className="mt-2 flex items-center gap-2">
            <button className="min-w-0 flex-1 text-left" type="button" onClick={() => openOnX(post.id)}>
              <p className="truncate text-[14px]">{post.text || '（无文字）'}</p>
              <p className="text-[12px] text-x-gray">回复 {post.replies} · 比上次查看多 {Math.max(0, post.replies - (labels[post.id]?.reviewedReplies ?? 0))}</p>
            </button>
            <button type="button" className={button} onClick={() => { reviewXReplies(post.id, post.replies); toast('已记下这次查看'); }}>已查看</button>
          </div>)}
          <p className="mt-1 text-[12px] text-x-gray">已扣除已知自回复。这里只知道数量变化，具体内容和是否需要回复请在 X 查看。</p>
        </div>}
        {recent.length > 0 && <div className="mt-4">
          <p className="text-[14px] font-semibold">新帖观察</p>
          {recent.map((post) => <button key={post.id} type="button" className="mt-2 block w-full text-left" onClick={() => openOnX(post.id)}>
            <p className="truncate text-[14px]">{post.text || '（无文字）'}</p>
            <p className="text-[12px] text-x-gray">发出 {Math.max(0, Math.floor((now - post.at) / 60_000))} 分钟 · 浏览 {hasMetric(post, 'views') ? post.views : '—'} · 赞 {hasMetric(post, 'likes') ? post.likes : '—'}
              {post.measuredAt > 0 && ` · ${Math.max(0, Math.floor((now - post.measuredAt) / 60_000))} 分钟前读取`}</p>
          </button>)}
          <p className="mt-1 text-[12px] text-x-gray">观察前两小时的变化，不代表获得扶持，也没有固定点赞率达标线。</p>
        </div>}
      </Section>

      <Section title="内容表现">
        <div className="mt-3 flex flex-wrap gap-2">
          {STAGES.filter((s) => s.key !== 'm30').map((s) => <button key={s.key} type="button" onClick={() => setStage(s.key)}
            className={cn(button, stage === s.key && 'border-x-fg bg-x-fg text-x-dark')}>{s.label}</button>)}
        </div>
        <div className="mt-2 flex gap-4 text-[13px]">
          {DIMENSIONS.map(([key, title]) => <button key={key} type="button" onClick={() => setDimension(key)}
            className={cn('py-1', dimension === key ? 'font-semibold text-x-fg' : 'text-x-gray')}>{title}</button>)}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-x-gray">只比较发布后约 {STAGES.find((s) => s.key === stage)!.label} 的真实观察，显示每条浏览的中位数。样本少时只展示事实。</p>
        {groups.length > 0 ? groups.slice(0, 8).map((group) => <ComparisonRow key={group.key} group={group} />)
          : <p className="mt-3 text-[14px] text-x-gray">还没有这个时间点的记录。新帖会自动积累；旧帖无法补出当时的数字。</p>}
        <p className="mt-2 text-[12px] leading-relaxed text-x-gray">收藏看保存价值，转发看传播，回复扣除已知自回复。浏览不是独立人数；这些指标不等于 X 的推荐分数。</p>

        <details className="mt-4">
          <summary className="cursor-pointer text-[14px] font-semibold">给帖子补分类{pending.length > 0 && ` · ${pending.length} 篇待确认`}</summary>
          {(showMore ? originals : originals.slice(0, 12)).map((post) => <div key={post.id} className="flex items-center gap-2 border-b border-x-border py-2.5">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openOnX(post.id)}>
              <p className="truncate text-[14px]">{post.text || '（无文字）'}</p>
              {!labels[post.id]?.topic && <p className="text-[11px] text-x-gray">建议：{suggestTopic(post.text)}</p>}
            </button>
            <select aria-label={`分类 ${post.text.slice(0, 20)}`} className={`${field} max-w-[145px]`} value={labels[post.id]?.topic ?? ''}
              onChange={(event) => labelXTweet(post.id, event.target.value)}>
              <option value="">未分类</option>
              {TOPICS.map((topic) => <option key={topic}>{topic}</option>)}
            </select>
          </div>)}
          {!showMore && originals.length > 12 && <button type="button" className={`${button} mt-2`} onClick={() => setShowMore(true)}>查看更早的帖子</button>}
        </details>
        {best.length > 0 && <details className="mt-4">
          <summary className="cursor-pointer text-[14px] font-semibold">这个时间点浏览最多的帖子</summary>
          {best.map((post) => <button key={post.id} type="button" className="mt-2 flex w-full items-center justify-between gap-2 text-left text-[14px]" onClick={() => openOnX(post.id)}>
            <span className="min-w-0 truncate">{post.text || '（无文字）'}</span><span className="shrink-0 tabular-nums">{number.format(post.views)}</span>
          </button>)}
        </details>}
      </Section>

      <Section title="本周实验">
        {active && result ? <>
          <p className="mt-2 text-[14px] font-semibold">{active[1].a} 与 {active[1].b}</p>
          <p className="mt-1 text-[12px] text-x-gray">{DIMENSIONS.find(([key]) => key === active[1].dimension)?.[1]}实验 · 以 24 小时浏览中位数观察</p>
          <ComparisonRow group={result.a} /><ComparisonRow group={result.b} />
          <p className="mt-2 text-[13px] leading-relaxed">
            {result.winner ? `目前「${result.winner}」领先，继续验证。内容差异、受众和日期仍可能影响结果，不能据此证明因果。`
              : result.enough ? '两组当前接近，继续记录，或结束后换一个变量。'
              : `两组已发布 ${result.postedA} / ${result.postedB} 条；等每组至少 ${MIN_COHORT} 份 24 小时记录、跨 2 天后再看初步倾向。`}
          </p>
          <button type="button" className={`${button} mt-2`} onClick={() => { endXExperiment(active[0]); toast('实验已结束，记录会保留'); }}>结束这次实验</button>
        </> : <p className="mt-2 text-[13px] leading-relaxed text-x-gray">选一个问题，轮换两种写法或时段。测试期间只改变这一项，以同龄数据复盘。</p>}
        <details className="mt-3">
          <summary className="cursor-pointer text-[14px] font-semibold">{active ? '换一个实验' : '开始一个实验'}</summary>
          <form className="mt-2" onSubmit={(event) => {
            event.preventDefault();
            if (startXExperiment(newDimension, a, b)) toast('实验已开始，只计开始后发出的原创');
          }}>
            <label className="block text-[12px] text-x-gray">只改变</label>
            <select aria-label="实验变量" className={`${field} mt-1 w-full`} value={newDimension} onChange={(event) => {
              const d = event.target.value as Dimension; setNewDimension(d); setA(options(d)[0]); setB(options(d)[1]);
            }}>{DIMENSIONS.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select aria-label="实验 A 组" className={field} value={a} onChange={(event) => setA(event.target.value)}>{options(newDimension).map((value) => <option key={value}>{value}</option>)}</select>
              <select aria-label="实验 B 组" className={field} value={b} onChange={(event) => setB(event.target.value)}>{options(newDimension).map((value) => <option key={value}>{value}</option>)}</select>
            </div>
            <p className="mt-1 text-[12px] text-x-gray">内容组按你确认的分类计入；时段按设备时区。新实验会结束上一次。</p>
            <button type="submit" className={`${button} mt-2 disabled:text-x-gray`} disabled={a === b}>开始记录</button>
          </form>
        </details>
        {experimentEntries.some(([, e]) => e.endedAt > 0) && <details className="mt-3">
          <summary className="cursor-pointer text-[14px] font-semibold">已结束的实验</summary>
          {experimentEntries.filter(([, e]) => e.endedAt > 0).slice(0, 5).map(([id, e]) => {
            const past = experimentResult(e, tweets, all24, labels);
            return <div key={id} className="border-b border-x-border py-2 text-[13px]">
              <p>{e.a} / {e.b}</p>
              <p className="text-[12px] text-x-gray">24 小时记录 {past.a.posts} / {past.b.posts} 条 · {past.winner ? `${past.winner} 暂时领先` : '尚无明确倾向'}</p>
            </div>;
          })}
        </details>}
      </Section>
    </>
  );
}

/** Keep research available without putting an algorithm essay in the daily workflow. */
export function FeedSection() {
  return <section className="px-4 pt-6">
    <details>
      <summary className="cursor-pointer text-[14px] font-semibold">推荐机制与数据范围</summary>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-x-gray">
        <p>X 针对每位读者预测行为。公开浏览、赞和回复只能帮助检验自己的写法，不能还原推荐分数。</p>
        <p>前两小时有条件性的探索机制；1.5% 是其中一个抽样先验，并非合格线。作者多样性作用于读者当次候选，不能推出“隔两小时就不会竞争”。</p>
        <p>训练自己的推荐流主要改变自己看到的内容。增长仍需要适合目标读者的原创和真实交流。</p>
        <p>数据来自 FxTwitter 公开接口；前两小时约每 5 分钟更新，三天内其他帖子约每小时，更旧的记录约每天刷新。关键点允许少量采样延迟，缺失不按零计。</p>
        <p>粉丝只记录账号净变化，不能归因到某篇帖。负反馈、停留和首页曝光目前不可见；低浏览也不能证明限流。</p>
        <p className="flex flex-wrap gap-4">
          <a className="text-x-blue" href="https://github.com/xai-org/x-algorithm" target="_blank" rel="noopener noreferrer">X 公开源码</a>
          <a className="text-x-blue" href="https://x.com/i/jf/under_the_hood" target="_blank" rel="noopener noreferrer">查看官方账号报告</a>
        </p>
      </div>
    </details>
  </section>;
}
