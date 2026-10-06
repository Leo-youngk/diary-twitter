import { useMemo } from 'react';
import { useNav } from '@/app/nav';
import { useChannelEnabled, useChannelMetrics, useChannelPosts } from '@/data/hooks';
import { store } from '@/data/store';
import { CHANNELS } from '@/lib/channels';
import { channelStats, type ChannelTotals } from '@/lib/channelStats';
import type { Channel } from '@/lib/schema';
import { ChannelLogo } from './ChannelDelivery';
import { Tile } from './StatsParts';

const number = new Intl.NumberFormat('zh-CN');
const say = (value: number | null) => (value === null ? '—' : number.format(value));
const time = (at: number) => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** The numbers each platform has; Threads counts quotes, Substack the subscriptions a Note brought. */
const SHOWN: Record<Channel, Array<[keyof ChannelTotals, string]>> = {
  substack: [['views', '浏览'], ['reactions', '赞'], ['comments', '回复'], ['reposts', 'Restack'], ['subscriptions', '新订阅']],
  threads: [['views', '浏览'], ['reactions', '赞'], ['comments', '回复'], ['reposts', '转发'], ['quotes', '引用']],
};

/** One platform's page of the 统计 tab: what went out there and what Buffer reported back. */
export default function ChannelStats({ channel, days, now }: { channel: Channel; days: number; now: number }) {
  const rows = useChannelPosts(channel);
  const metrics = useChannelMetrics(channel);
  const enabled = useChannelEnabled(channel);
  const { push } = useNav();
  const { name } = CHANNELS[channel];
  const stats = useMemo(() => channelStats(rows, metrics, days, now), [rows, metrics, days, now]);
  const textOf = (id: string, kind: string) => String((kind === 'reply' ? store.getCell('replies', id, 'content') : store.getCell('posts', id, 'content')) ?? '');

  if (!enabled && Object.keys(rows).length === 0) {
    return (
      <div className="px-4 py-6">
        <p className="flex items-center gap-2 text-[15px] font-semibold"><ChannelLogo channel={channel} size={14} /> 还没有同步到 {name}</p>
        <p className="mt-2 text-[14px] leading-relaxed text-x-gray">在 Buffer 里连接 {name}，再在设置里打开「发帖时默认同步到 {name}」。发出去的帖子会在这里显示 {name} 上的数据。</p>
        <button type="button" onClick={() => push('Settings', {})} className="mt-3 py-2 text-[14px] text-x-blue">去设置</button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <p className="flex items-center gap-2 text-[13px] text-x-gray">
        <ChannelLogo channel={channel} size={13} />
        <span>近 {days} 天发出 {stats.posts.length} 条{stats.measuredAt > 0 && ` · 数据更新于 ${time(stats.measuredAt)}`}</span>
      </p>
      {(stats.pending > 0 || stats.failed > 0) && (
        <button type="button" onClick={() => push('Settings', {})} className={stats.failed > 0 ? 'mt-1 text-[13px] text-x-danger' : 'mt-1 text-[13px] text-x-gray'}>
          {stats.pending > 0 && `${stats.pending} 条正在发`}{stats.pending > 0 && stats.failed > 0 && ' · '}{stats.failed > 0 && `${stats.failed} 条发送失败，去处理`}
        </button>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile label="发出" value={number.format(stats.posts.length)} note={stats.posts.length > 0 ? `${stats.measured} 条已有数据` : undefined} />
        {SHOWN[channel].map(([key, label]) => <Tile key={key} label={label} value={say(stats.totals[key])} />)}
      </div>

      <h2 className="pt-6 text-[16px] font-semibold">逐条数据</h2>
      {stats.posts.length === 0 ? (
        <p className="mt-2 text-[14px] text-x-gray">近 {days} 天没有发到 {name} 的帖子。</p>
      ) : (
        <ul className="mt-1">
          {stats.posts.map((post) => (
            <li key={post.id} className="border-b border-x-border py-3 last:border-b-0">
              <p className="line-clamp-2 whitespace-pre-line text-[14px] leading-relaxed">{post.kind === 'reply' ? '追加：' : ''}{textOf(post.id, post.kind) || '（已删除）'}</p>
              <div className="mt-1 flex items-baseline justify-between gap-3 text-[12px] text-x-gray">
                <span>{post.metrics
                  ? SHOWN[channel].map(([key, label]) => `${say(post.metrics![key])} ${label}`).join(' · ')
                  : 'Buffer 还没有返回数据（发出后最多 24 小时）'}</span>
                <span className="shrink-0">
                  {time(post.at)}
                  {post.link && <a href={post.link} target="_blank" rel="noopener noreferrer" className="ml-2 text-x-blue">查看 ↗</a>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[12px] leading-relaxed text-x-gray">数据来自 Buffer，每天从 {name} 读取一次，最近 30 天发出的帖子才会更新；{name} 没有提供的数字显示为 —。</p>
    </div>
  );
}
