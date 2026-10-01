import { toast } from '@/app/toast';
import { sendXCommand } from '@/data/actions';
import { useConnectionState } from '@/data/connection';
import type { XPostRow } from '@/lib/schema';
import { cn } from '@/lib/utils';

/** Kept on the post until resolved; phone users cannot rely on hover titles. */
export default function XDeliveryStatus({ id, requested, x }: { id: string; requested: boolean; x: XPostRow | null }) {
  const connection = useConnectionState();
  if ((!requested && !x) || x?.state === 'sent' || x?.state === 'dismissed') return null;
  const failed = x?.state === 'failed';
  const retrying = x?.command === 'retry';
  const message = retrying ? '等待服务器接收重试请求'
    : failed ? `X 同步失败：${x.error || '请稍后重试'}`
      : x?.error ? `X 尚未发出：${x.error}`
        : x?.state === 'publishing' ? '正在确认 X 发布结果'
          : x?.state === 'sending' ? '正在发送到 X'
            : connection !== 'online' ? '已保存在本机，等待连接后同步到 X'
              : x?.state === 'queued' ? '等待发送到 X' : '等待服务器接收，尚未发到 X';
  return (
    <p className={cn('mt-1 break-words text-[12px] leading-relaxed', failed ? 'text-x-danger' : 'text-x-gray')}>
      {message}
      {failed && (
        <button
          type="button"
          disabled={retrying}
          onClick={(event) => {
            event.stopPropagation();
            sendXCommand(id, 'retry');
            toast('已请求重试 X 同步', 'info');
          }}
          className="ml-2 inline-block font-semibold text-x-blue disabled:opacity-50"
        >
          {retrying ? '等待重试' : '重试'}
        </button>
      )}
    </p>
  );
}
