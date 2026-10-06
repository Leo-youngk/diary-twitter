import { toast } from '@/app/toast';
import { syncPostToX } from '@/app/publish';
import { sendXCommand } from '@/data/actions';
import type { XPostRow } from '@/lib/schema';

/**
 * Saved posts have an explicit send action. An accepted request shows its
 * current stage, and a failure stays here with its retry.
 */
export default function XDeliveryStatus({ id, requested, x, canSync = false }: { id: string; requested: boolean; x: XPostRow | null; table?: 'posts' | 'replies'; canSync?: boolean }) {
  if (canSync && !requested && !x) return (
    <p className="mt-1.5 text-[12px] text-x-gray" onClick={(event) => event.stopPropagation()}>
      未同步 X
      <button type="button" onClick={() => syncPostToX(id)} className="ml-2 font-semibold text-x-blue">同步到 X</button>
    </p>
  );
  if (x?.command === 'send' || (requested && (!x || ['queued', 'sending', 'publishing'].includes(x.state)))) return (
    <p role="status" className="mt-1.5 text-[12px] text-x-gray">
      {x?.command === 'send' ? '正在提交 X 同步请求'
        : x?.state === 'sending' ? '正在发送到 X'
        : x?.state === 'publishing' ? '正在确认 X 发布结果' : '等待同步到 X'}
    </p>
  );
  if (x?.state !== 'failed') return null;
  const retrying = x.command === 'retry';
  return (
    <p role="status" className="mt-1.5 break-words text-[12px] leading-relaxed text-x-danger" onClick={(event) => event.stopPropagation()}>
      X 发送失败{x.error && `：${x.error}`}
      <button
        type="button"
        disabled={retrying}
        onClick={() => { sendXCommand(id, 'retry'); toast('已请求重试 X 同步', 'info'); }}
        className="ml-2 inline-block font-semibold text-x-blue disabled:opacity-50"
      >
        {retrying ? '等待重试' : '重试'}
      </button>
    </p>
  );
}
