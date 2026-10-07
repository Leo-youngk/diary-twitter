import { toast } from '@/app/toast';
import { sendChannelCommand } from '@/data/actions';
import { useChannelPost } from '@/data/hooks';
import { CHANNEL_IDS, CHANNELS } from '@/lib/channels';
import type { Channel, ChannelPostRow } from '@/lib/schema';
import { cn } from '@/lib/utils';
import { SubstackLogo, ThreadsLogo } from './Icon';

export function ChannelLogo({ channel, size = 12, className }: { channel: Channel; size?: number; className?: string }) {
  return channel === 'substack' ? <SubstackLogo size={size} className={className} /> : <ThreadsLogo size={size} className={className} />;
}

/** Where a post stands on one platform: grey when published, faint on its way, red when it needs attention. */
function ChannelMark({ channel, row, size }: { channel: Channel; row: ChannelPostRow | null; size: number }) {
  if (!row || row.state === 'dismissed') return null;
  const { name } = CHANNELS[channel];
  const failed = row.state === 'failed';
  const pending = row.state === 'queued' || row.state === 'sending' || row.state === 'publishing';
  const title = failed ? `${name} 同步需要处理：${row.error}`
    : pending ? (row.error || (row.state === 'publishing' ? `Buffer 已接收，正在核对 ${name} 发布状态` : `等待发到 ${name}`))
    : `已发到 ${name}`;
  return (
    <span title={title} className={cn('inline-flex items-center', failed ? 'text-x-danger' : 'text-x-gray', pending && 'opacity-50')}>
      <ChannelLogo channel={channel} size={size} />
    </span>
  );
}

/** A failed delivery stays on its post with a retry, one line per platform. */
function ChannelStatus({ channel, id, row }: { channel: Channel; id: string; row: ChannelPostRow | null }) {
  if (row?.state !== 'failed') return null;
  const { name } = CHANNELS[channel];
  const retrying = row.command === 'retry';
  return (
    <p role="status" className="mt-1.5 break-words text-[12px] leading-relaxed text-x-danger" onClick={(event) => event.stopPropagation()}>
      {name} 发送失败{row.error && `：${row.error}`}
      <button
        type="button"
        disabled={retrying}
        onClick={() => { sendChannelCommand(channel, id, 'retry'); toast(`已请求重试 ${name} 同步`, 'info'); }}
        className="ml-2 inline-block font-semibold text-x-blue disabled:opacity-50"
      >
        {retrying ? '等待重试' : '重试'}
      </button>
    </p>
  );
}

function Mark({ channel, id, size }: { channel: Channel; id: string; size: number }) {
  return <ChannelMark channel={channel} row={useChannelPost(channel, id)} size={size} />;
}

function Status({ channel, id }: { channel: Channel; id: string }) {
  return <ChannelStatus channel={channel} id={id} row={useChannelPost(channel, id)} />;
}

/** The Substack and Threads marks of a post or 追加, after its X mark. */
export function ChannelMarks({ id, size = 12 }: { id: string; size?: number }) {
  return <>{CHANNEL_IDS.map((channel) => <Mark key={channel} channel={channel} id={id} size={size} />)}</>;
}

/** The Substack and Threads failures of a post or 追加, each with its own retry. */
export function ChannelStatuses({ id }: { id: string }) {
  return <>{CHANNEL_IDS.map((channel) => <Status key={channel} channel={channel} id={id} />)}</>;
}

function Link({ channel, id }: { channel: Channel; id: string }) {
  const row = useChannelPost(channel, id);
  if (!row || row.state === 'dismissed') return null;
  const { name, item } = CHANNELS[channel];
  return (
    <>
      <span>·</span>
      {row.state === 'sent' && row.link ? (
        <a href={row.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-x-blue">
          <ChannelLogo channel={channel} /> 查看 {item === 'Note' ? 'Note' : name}
        </a>
      ) : (
        <span className={cn('inline-flex items-center gap-1', row.state === 'failed' && 'text-x-danger')}>
          <ChannelLogo channel={channel} /> {row.state === 'failed' ? `${name} 同步需要处理`
            : row.state === 'sent' ? `已发到 ${name}`
            : row.state === 'publishing' ? `Buffer 已接收，正在核对 ${name} 发布结果` : `等待发到 ${name}`}
        </span>
      )}
    </>
  );
}

/** On a post's page: where it is on Substack and Threads, linked once published. */
export function ChannelLinks({ id }: { id: string }) {
  return <>{CHANNEL_IDS.map((channel) => <Link key={channel} channel={channel} id={id} />)}</>;
}
