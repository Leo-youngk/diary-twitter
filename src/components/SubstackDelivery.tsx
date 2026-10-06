import { toast } from '@/app/toast';
import { sendSubstackCommand } from '@/data/actions';
import type { SubstackPostRow } from '@/lib/schema';
import { cn } from '@/lib/utils';
import { SubstackLogo } from './Icon';

/** Where this post stands as a Substack Note: grey when published, faint on its way, red when it needs attention. */
export function SubstackMark({ note, size = 12 }: { note: SubstackPostRow | null; size?: number }) {
  if (!note || note.state === 'dismissed') return null;
  const failed = note.state === 'failed';
  const pending = note.state === 'queued' || note.state === 'sending' || note.state === 'publishing';
  const title = failed ? `Substack 同步需要处理：${note.error}`
    : pending ? (note.error || (note.state === 'publishing' ? 'Buffer 已接收，正在核对 Substack 发布状态' : '等待发到 Substack'))
    : '已发到 Substack';
  return (
    <span title={title} className={cn('inline-flex items-center', failed ? 'text-x-danger' : 'text-x-gray', pending && 'opacity-50')}>
      <SubstackLogo size={size} />
    </span>
  );
}

/** A failed Note stays on its post with a retry, as a failed tweet does. */
export function SubstackStatus({ id, note }: { id: string; note: SubstackPostRow | null }) {
  if (note?.state !== 'failed') return null;
  const retrying = note.command === 'retry';
  return (
    <p role="status" className="mt-1.5 break-words text-[12px] leading-relaxed text-x-danger" onClick={(event) => event.stopPropagation()}>
      Substack 发送失败{note.error && `：${note.error}`}
      <button
        type="button"
        disabled={retrying}
        onClick={() => { sendSubstackCommand(id, 'retry'); toast('已请求重试 Substack 同步', 'info'); }}
        className="ml-2 inline-block font-semibold text-x-blue disabled:opacity-50"
      >
        {retrying ? '等待重试' : '重试'}
      </button>
    </p>
  );
}
