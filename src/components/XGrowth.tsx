import { toast } from '@/app/toast';
import Icon from '@/components/Icon';
import { Section, Tile } from '@/components/StatsParts';
import { addGoals } from '@/data/actions';
import { useGoalIds } from '@/data/hooks';
import { store } from '@/data/store';
import {
  COLD_START_FOLLOWER_CAP, DAILY_ORIGINALS, DAILY_REPLIES, MIN_VIEWS, PRIOR_LIKE_RATE,
  type Diagnosis, type TodayPlan, type WeightedAction,
} from '@/lib/growth';
import { cn } from '@/lib/utils';

// What the sections below say rests on X's open-sourced For You code; see
// src/lib/growth.ts and docs/2026-10-04-x-algorithm-growth.md.

const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const percent = (rate: number | null) => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`);
const oneDecimal = (value: number | null) => (value === null ? '—' : value >= 100 ? value.toFixed(0) : value.toFixed(1));
const clock = (at: number) => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const openOnX = (id: string) => window.open(`https://x.com/i/status/${id}`, '_blank', 'noopener');

const PLAN_GOALS = [
  `发 ${DAILY_ORIGINALS} 条原创，间隔 2 小时以上`,
  `认真回复 ${DAILY_REPLIES} 条同领域的帖子`,
  '刷推：好内容点赞收藏，差内容点「不感兴趣」',
];

function Step({ done, title, count, children }: { done?: boolean; title: string; count?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-x-border py-3">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          done ? 'border-x-blue bg-x-blue text-white' : 'border-x-gray/60',
        )}
      >
        {done && <Icon name="check" size={12} strokeWidth={3.2} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold">{title}</p>
          {count && <span className="shrink-0 text-[14px] tabular-nums text-x-gray">{count}</span>}
        </div>
        <div className="mt-0.5 text-[13px] leading-[1.5] text-x-gray">{children}</div>
      </div>
    </div>
  );
}

/** 今天: the day's three habits, the posts still in their 2-hour window, and replies waiting for an answer. */
export function TodaySection({ plan, followers, today, now }: { plan: TodayPlan; followers: number | null; today: string; now: number }) {
  const goalIds = useGoalIds(today);
  const written = new Set(goalIds.map((id) => String(store.getCell('goals', id, 'text') ?? '')));
  const missing = PLAN_GOALS.filter((text) => !written.has(text));
  const eligible = followers === null || followers <= COLD_START_FOLLOWER_CAP;
  const windowEndsAt = plan.inWindow[0]?.endsAt;

  return (
    <Section title="今天">
      <p className="mt-1 text-[13px] text-x-gray">按 X 开源的推荐代码排出来的每日功课</p>
      <div className="mt-1">
        <Step done={plan.originals >= DAILY_ORIGINALS} title={`发 ${DAILY_ORIGINALS} 条原创`} count={`${plan.originals}/${DAILY_ORIGINALS}`}>
          回复和转发不会推荐给陌生人，只有原创能。推荐流只留帖子 48 小时，所以要天天发。
          {windowEndsAt && windowEndsAt > now && (
            <span className="block text-x-fg">上一条还在 2 小时扶持窗口里，{clock(windowEndsAt)} 之后再发，别让两条抢同一个位置。</span>
          )}
        </Step>
        <Step done={plan.replies >= DAILY_REPLIES} title={`认真回复 ${DAILY_REPLIES} 条`} count={`${plan.replies}/${DAILY_REPLIES}`}>
          同领域的帖子、自己的评论区都算。回复换来的是互关：互相关注的人刷到你的原创时，「回复」的权重从 5 升到 20。别连发，也别发模板话。
        </Step>
        <Step title="刷推时顺手训练推荐">
          点赞、收藏、回复、停留都会写进你的行为序列，下一次刷新就照着它推荐；看到不想要的点「不感兴趣」。
        </Step>
      </div>
      <button
        type="button"
        disabled={missing.length === 0}
        onClick={() => {
          addGoals(today, missing);
          toast('已加入今天的目标');
        }}
        className="pressable mt-3 w-full rounded-full border border-x-border py-2 text-[15px] font-semibold disabled:text-x-gray"
      >
        {missing.length === 0 ? '已在今天的目标里' : '加入今天的目标'}
      </button>

      {eligible && plan.inWindow.map((post) => (
        <button
          key={post.id}
          type="button"
          onClick={() => openOnX(post.id)}
          className="mt-3 block w-full rounded-2xl border border-x-blue/40 bg-x-blue/5 px-4 py-3 text-left active:bg-x-hover"
        >
          <p className="text-[13px] font-semibold text-x-blue">
            扶持窗口 · 还剩 {Math.max(1, Math.ceil((post.endsAt - now) / 60_000))} 分钟
          </p>
          <p className="mt-1 truncate text-[15px]">{post.text || '（无文字）'}</p>
          <p className="mt-1 text-[13px] text-x-gray">
            {post.likeRate === null ? '还没读到数据' : (
              <>
                浏览 {post.views} · 赞 {post.likes} · 点赞率 {percent(post.likeRate)}
                {post.views > 0 && (
                  <span className={post.likeRate > PRIOR_LIKE_RATE ? 'text-x-green' : undefined}>
                    {post.likeRate > PRIOR_LIKE_RATE ? ' · 高于 1.5% 的起点' : ' · 还没到 1.5% 的起点'}
                  </span>
                )}
              </>
            )}
          </p>
        </button>
      ))}
      {eligible && plan.inWindow.length > 0 && (
        <p className="mt-2 text-[12px] leading-[1.5] text-x-gray">
          粉丝 5 万以下的账号，原创发出 2 小时内、首页曝光不到 200 次时，会和别的新帖争每次刷新里约第 16 位的扶持位：先按点赞率抽签（起点 1.5%），再比模型分。头几十个读者肯不肯点赞最要紧。
        </p>
      )}

      {plan.answered.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[15px] font-semibold">评论区有人在等你</h3>
          {plan.answered.map(({ id, text, replies }) => (
            <button
              key={id}
              type="button"
              onClick={() => openOnX(id)}
              className="flex w-full items-center gap-3 border-b border-x-border py-2.5 text-left active:bg-x-hover"
            >
              <p className="min-w-0 flex-1 truncate text-[15px]">{text || '（无文字）'}</p>
              <span className="shrink-0 text-[13px] tabular-nums text-x-gray">{replies} 条回复</span>
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

const MIX: Array<[WeightedAction, string, number]> = [
  ['replies', '回复', 1],
  ['quotes', '引用', 0.72],
  ['reposts', '转发', 0.48],
  ['likes', '赞', 0.28],
];

function mixAdvice(mix: Record<WeightedAction, number>): string {
  if (mix.replies + mix.quotes >= 0.5) return '得分主要来自回复和引用：能引出讨论的写法最合排序的胃口，保持。';
  if (mix.likes >= 0.6) return '得分大多来自点赞。回复和引用的权重是点赞的 10 倍：抛个问题、亮个能被反驳的观点，把读者拉进评论区。';
  return '回复和引用的权重是点赞的 10 倍、转发的 5 倍：能引出讨论的帖子最划算。';
}

/** 算法视角: the range's originals measured the way X's ranking weighs them. */
export function AlgorithmSection({ diagnosis: d, onOpen }: { diagnosis: Diagnosis; onOpen: (id: string) => void }) {
  const bestHour = d.hours.reduce<Diagnosis['hours'][number] | null>((best, h) => (!best || h.medianViews > best.medianViews ? h : best), null);
  return (
    <Section title="算法视角">
      {d.settled === 0 ? (
        <p className="mt-1 text-[13px] text-x-gray">
          {d.originals > 0 ? '这段时间的原创还没满 24 小时，数字还在涨，明天再看。' : '这段时间没有原创。'}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-x-gray">发出满 24 小时的 {d.settled} 条原创，按 X 开源代码里的权重算</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Tile
              label="点赞率"
              value={percent(d.likeRate)}
              note={d.rated > 0 ? `${d.rated} 条里 ${d.beatPrior} 条高于 1.5%` : `每条要有 ${MIN_VIEWS} 次浏览才比较`}
            />
            <Tile label="每千次浏览得分" value={oneDecimal(d.scorePerThousand)} note="回复引用 ×5 · 赞 ×0.5" />
            <Tile label="回复 + 引用" value={oneDecimal(d.talkPerThousand)} note="每千次浏览" />
            <Tile label="收藏" value={oneDecimal(d.bookmarksPerThousand)} note="每千次浏览 · 实用度" />
          </div>

          {(d.scorePerThousand ?? 0) > 0 && (
            <div className="mt-4">
              <h3 className="text-[15px] font-semibold">得分从哪来</h3>
              <div className="mt-2 flex h-2.5 gap-px overflow-hidden rounded-full bg-x-border" role="img" aria-label="得分构成">
                {MIX.map(([key, , opacity]) => (
                  <span key={key} style={{ width: `${d.mix[key] * 100}%`, background: 'var(--chart-bar)', opacity }} />
                ))}
              </div>
              <p className="mt-1.5 text-[12px] tabular-nums text-x-gray">
                {MIX.map(([key, label]) => `${label} ${Math.round(d.mix[key] * 100)}%`).join(' · ')}
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.5]">{mixAdvice(d.mix)}</p>
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-[15px] font-semibold">节奏</h3>
            <p className="mt-1 text-[13px] leading-[1.5]">
              {d.crowded > 0
                ? `${d.originals} 条原创里有 ${d.crowded} 条和上一条隔不到 2 小时。同一位读者一次刷新里，你的第二条只按 62.5% 计分、第三条 43.75%，而且它们会抢同一个扶持位。`
                : d.originals > 1 ? '原创之间都隔了 2 小时以上，不会自己跟自己抢。' : '原创还太少，看不出节奏。'}
            </p>
          </div>

          <div className="mt-4">
            <h3 className="text-[15px] font-semibold">发帖时段</h3>
            {d.hours.length >= 2 ? (
              <>
                {d.hours.map((h) => (
                  <div key={h.from} className="flex items-center justify-between gap-3 border-b border-x-border py-2 text-[14px]">
                    <span>
                      {h.from}–{h.to} 点
                      {h === bestHour && <span className="ml-1.5 rounded bg-x-blue/15 px-1.5 py-px text-[12px] text-x-blue">最好</span>}
                    </span>
                    <span className="tabular-nums text-x-gray">
                      {h.posts} 条 · 中位浏览 {compact.format(h.medianViews)} · 赞 {percent(h.likeRate)}
                    </span>
                  </div>
                ))}
                <p className="mt-1.5 text-[12px] text-x-gray">扶持位只看头 2 小时，挑你的读者在线的时候发。</p>
              </>
            ) : (
              <p className="mt-1 text-[13px] leading-[1.5] text-x-gray">
                {d.hours.length === 1
                  ? `只有 ${d.hours[0].from}–${d.hours[0].to} 点发过 2 条以上。别的时段也各发几条，才比得出哪个时段的读者多。`
                  : '每个时段至少要有 2 条满 24 小时的原创才能比较，再攒一攒。'}
              </p>
            )}
          </div>

          {d.best.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-[15px] font-semibold">排序最喜欢的</h3>
              {d.best.map(({ id, text, score, likeRate }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpen(id)}
                  className="flex w-full items-center gap-3 border-b border-x-border py-2.5 text-left active:bg-x-hover"
                >
                  <p className="min-w-0 flex-1 truncate text-[15px]">{text || '（无文字）'}</p>
                  <span className="shrink-0 text-right text-[13px] tabular-nums text-x-gray">
                    得分 {oneDecimal(score)} · 赞 {percent(likeRate)}
                  </span>
                </button>
              ))}
              <p className="mt-1.5 text-[12px] text-x-gray">照着它们的写法多来几条。</p>
            </div>
          )}
        </>
      )}

      {d.replies > 0 && (
        <p className="mt-4 text-[13px] text-x-gray">
          这段时间回复别人 <span className="font-semibold text-x-fg">{d.replies}</span> 条，收到 {d.replyLikes} 个赞
        </p>
      )}
      <p className="mt-3 text-[12px] leading-[1.5] text-x-gray">
        X 排序时用的是模型对每位读者的预测，这里拿实际比率代替。不感兴趣、静音、屏蔽、举报看不到，却是权重最重的几项。
      </p>
    </Section>
  );
}

const FEED_TIPS = [
  '最近的点赞、回复、转发、收藏、分享、发帖和停留，是推荐模型读你的主要依据：只给想多看的东西互动，别在引战帖上停留。',
  '「不感兴趣」「静音作者」「屏蔽」是很重的负信号（权重 −47.5、−58.8、−31.2，点赞才 0.5）。它们乘在模型对你本人的预测上：你点得越多，同类帖子在你这里排得越后。',
  '静音关键词是硬过滤，命中的帖子在排序前就被删掉。',
  '关注的人 48 小时内的帖子都会进候选，没关注的要打 75 折：多关注你想看的领域里的好账号。',
];

const HEALTH_TIPS = [
  '粉丝少、信誉分低的账号若被模型判成「AI 水文」或「快速刷回复」，帖子乃至整个账号会被打上垃圾标签 30 天，期间不再推荐给非粉丝。用自己的话写，回复别连发。',
  '你回复别人的每一条都会被模型打 0–3 分（25 万粉以上的帖子下由 Grok 打），评论区按分数排；0 分会被标成垃圾回复。',
  '别成批 @ 陌生人：被你 @ 到的人静音、屏蔽、举报你，会单独记进账号的负面比率。',
];

/** 刷到好内容 and 账号健康: what shapes the feed one reads, and what quietly limits an account. */
export function FeedSection() {
  return (
    <Section title="刷到好内容">
      <ul className="mt-2 space-y-2 text-[14px] leading-[1.55]">
        {FEED_TIPS.map((tip) => <li key={tip} className="flex gap-2"><span className="text-x-gray">·</span><span>{tip}</span></li>)}
      </ul>
      <h3 className="mt-5 text-[15px] font-semibold">账号健康</h3>
      <ul className="mt-2 space-y-2 text-[14px] leading-[1.55]">
        {HEALTH_TIPS.map((tip) => <li key={tip} className="flex gap-2"><span className="text-x-gray">·</span><span>{tip}</span></li>)}
      </ul>
      <button
        type="button"
        onClick={() => window.open('https://x.com/i/jf/under_the_hood', '_blank', 'noopener')}
        className="pressable mt-4 w-full rounded-full border border-x-border py-2 text-[15px] font-semibold"
      >
        查账号有没有被限流 · Under the Hood
      </button>
    </Section>
  );
}
