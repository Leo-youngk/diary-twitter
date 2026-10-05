import { hasMetric, type Metric } from '@/lib/xMetrics';
import { discoveryTakeaway, discussionSearch, writingPrompt, type InsightPost, type xInsights } from '@/lib/xInsights';

const number = new Intl.NumberFormat('zh-CN');
const entryName = { original: '原创', reply: '对外回复', thread: '串文 / 自己的补充' };
const link = (post: InsightPost) => `https://x.com/i/status/${post.id}`;
const metric = (post: InsightPost, key: Metric) => hasMetric(post, key) ? number.format(post[key]) : '—';

function Evidence({ post }: { post: InsightPost }) {
  const labels: Array<[Metric, string]> = [['likes', '赞'], ['replies', '回复'], ['reposts', '转发'], ['quotes', '引用'], ['bookmarks', '收藏']];
  const feedback = labels.filter(([key]) => hasMetric(post, key) && post[key] > 0)
    .map(([key, label]) => `${metric(post, key)} ${label}`).join(' · ');
  return <span className="text-[12px] leading-6 text-x-gray">{metric(post, 'views')} 浏览 · {feedback || (post.reactionsComplete ? '暂无公开互动' : '互动数据不完整')}</span>;
}

export function GrowthDashboard({ insights, handle, onWrite }: {
  insights: ReturnType<typeof xInsights>;
  handle: string;
  onWrite: (prompt: string) => void;
}) {
  const { comparison, seeds } = insights;
  const source = seeds[0];
  const search = discussionSearch(source, handle);
  const takeaway = discoveryTakeaway(comparison);
  const title = !source ? '写一个别人能接话的具体经历'
    : source.entry === 'reply' ? '把收到回应的回复，展开成原创' : '接着有回应的内容，写一个新例子';
  return <div className="px-4">
    <section aria-labelledby="next-action" className="rounded-2xl bg-x-darker p-4">
      <p className="text-[12px] font-medium text-x-gray">下一步</p>
      <h2 id="next-action" className="mt-1 text-[19px] font-semibold leading-snug">{title}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-x-gray">{source
        ? source.entry === 'reply' ? '有人对这段经验作出了反应。补上你怎么做、结果怎样，让同样遇到问题的人能直接用。'
          : '有人回应过这个想法。补一个你亲身经历的例子，比重复同一句观点更值得尝试。'
        : '先写你刚解决的小问题，或改变看法的一件事，再到相关讨论里分享细节。等真实反馈出现，再决定继续写什么。'}</p>
      {source && <a href={link(source)} target="_blank" rel="noopener noreferrer" className="mt-3 block border-l-2 border-x-border pl-3 hover:text-x-blue">
        <p className="line-clamp-2 whitespace-pre-line text-[14px] leading-relaxed">{source.text}</p>
        <Evidence post={source} />
      </a>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={() => onWrite(writingPrompt(source))} className="pressable rounded-full bg-x-fg px-4 py-2 text-[14px] font-semibold text-x-dark">{source ? '展开这条内容' : '写一条'}</button>
        {search && <a href={search} target="_blank" rel="noopener noreferrer" className="py-2 text-[14px] text-x-blue">找相关讨论 ↗</a>}
      </div>
    </section>

    {(comparison.original.count > 0 || comparison.reply.count > 0) && <section aria-labelledby="discovery-evidence" className="pt-6">
      <h2 id="discovery-evidence" className="text-[16px] font-semibold">在哪里被看见</h2>
      {takeaway && <p className="mt-2 text-[14px] leading-relaxed">{takeaway}</p>}
      <table className="mt-2 w-full text-left text-[14px]">
        <caption className="sr-only">原创与对外回复的浏览和公开互动，不含已识别的自己回复自己</caption>
        <thead className="text-[12px] font-normal text-x-gray"><tr><th scope="col" className="py-2 font-normal">入口 / 样本</th><th scope="col" className="py-2 text-right font-normal">浏览中位数</th><th scope="col" className="py-2 text-right font-normal">收到互动</th></tr></thead>
        <tbody>{(['original', 'reply'] as const).map((entry) => {
          const group = comparison[entry];
          return <tr key={entry} className="border-t border-x-border">
            <th scope="row" className="py-3 font-normal">{entryName[entry]}<span className="ml-2 text-[12px] text-x-gray">{group.count} 条</span></th>
            <td className="py-3 text-right text-[20px] font-semibold tabular-nums">{group.medianViews === null ? '—' : number.format(group.medianViews)}</td>
            <td className="py-3 text-right tabular-nums">{group.feedbackKnown ? `${group.responded}/${group.feedbackKnown}` : '—'}</td>
          </tr>;
        })}</tbody>
      </table>
      <p className="text-[12px] leading-relaxed text-x-gray">{comparison.basis === 'h24' ? '发布 24h 的记录' : '已满 24h，累计数据'} · 互动含赞、他人回复、转发、引用、收藏。</p>
    </section>}

    {seeds.length > 1 && <details className="mt-5 text-[14px]">
      <summary className="cursor-pointer text-x-gray">其他写作素材 · {seeds.length - 1} 条</summary>
      {seeds.slice(1).map((post) => <div key={post.id} className="border-b border-x-border py-3">
        <a href={link(post)} target="_blank" rel="noopener noreferrer" className="block hover:text-x-blue"><p className="line-clamp-2 whitespace-pre-line text-[14px] leading-relaxed">{post.text}</p></a>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2"><Evidence post={post} /><button type="button" onClick={() => onWrite(writingPrompt(post))} className="py-1 text-[13px] text-x-blue">接着写</button></div>
      </div>)}
    </details>}
  </div>;
}

export function DataDetails({ posts, now }: { posts: InsightPost[]; now: number }) {
  const time = (at: number) => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return <details className="mx-4 mt-6 border-t border-x-border pt-4">
    <summary className="cursor-pointer text-[14px] text-x-gray">帖子明细 · {posts.length} 条</summary>
    {posts.length === 0 && <p className="py-3 text-[13px] text-x-gray">这段时间还没有读到帖子。</p>}
    {posts.map((post) => <a key={post.id} href={link(post)} target="_blank" rel="noopener noreferrer" className="block border-b border-x-border py-3 hover:text-x-blue">
      <p className="text-[12px] text-x-gray">{entryName[post.entry]} · {time(post.at)}{now - post.at < 24 * 3600_000 && ' · 未满 24 小时'}</p>
      <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed">{post.text || '（无文字）'}</p>
      <Evidence post={post} />
    </a>)}
    <p className="mt-3 text-[12px] leading-relaxed text-x-gray">明细是每条帖子的最新累计公开数据；浏览不是独立读者，也不能区分推荐、关注流或会话页。缺失项显示 —，自己的补充不计作读者反馈。</p>
  </details>;
}

export function MethodSources({ noFeedback }: { noFeedback: InsightPost | null }) {
  return <details className="mx-4 mt-4 text-[12px] leading-relaxed text-x-gray">
    <summary className="cursor-pointer py-1">方法与案例来源</summary>
    {noFeedback && <p className="mt-2">你的一条<a href={link(noFeedback)} target="_blank" rel="noopener noreferrer" className="text-x-blue">回复</a>有 {number.format(noFeedback.views)} 浏览，却没有公开互动。高浏览只能证明被看见过，还需要观察是否有人继续交流。</p>}
    <p className="mt-2">X 按读者的历史互动推荐内容，会话页也单独排序回复。参与相关讨论是可尝试的读者入口；公开计数不能还原推荐权重。</p>
    <p className="mt-2">独立开发者的 3 个月案例报告了 878 位 X 来源访客，但包含 Premium 和付费推广。另一项 35 次回复实验中，两条占了一半以上曝光。两者都不能证明“多回复必涨粉”。</p>
    <p className="mt-2">本页先找你收到反馈的内容，再接到写作。关注变化只按实际观测区间计算；目前没有主页访问或逐帖关注数据，无法计算关注转化。</p>
    <div className="mt-2 flex flex-col items-start gap-2 text-x-blue">
      <a href="https://help.x.com/en/resources/recommender-systems/conversations-recommendations" target="_blank" rel="noopener noreferrer">X 官方会话推荐说明 ↗</a>
      <a href="https://note.com/typingmusou_0412/n/na07823535aa9?hl=en" target="_blank" rel="noopener noreferrer">独立开发者的冷启动复盘 ↗</a>
      <a href="https://rakeshreddy.dev/experiments/twitter-reply-experiment" target="_blank" rel="noopener noreferrer">35 次回复的实际结果 ↗</a>
      <a href="https://github.com/Leo-youngk/diary-twitter/blob/master/docs/2026-10-04-cold-start-redesign.md" target="_blank" rel="noopener noreferrer">本次调研与设计依据 ↗</a>
    </div>
  </details>;
}
