import { toast } from '@/app/toast';
import { sendXCommand } from '@/data/actions';
import type { XPostRow } from '@/lib/schema';

/**
 * Only a failure stays on the post, with its retry; progress is the bar along
 * the top, as on X. Phone users cannot rely on hover titles, so the reason is spelled out.
 */
export default function XDeliveryStatus({ id, x }: { id: string; requested: boolean; x: XPostRow | null; table?: 'posts' | 'replies' }) {
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
